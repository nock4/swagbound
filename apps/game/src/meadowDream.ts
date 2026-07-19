import Phaser from "phaser";

/**
 * The pre-wake meadow dream. Bosch holds a direction and walks forever into a
 * wildflower meadow that deepens in stages while Cloak (the ally he has not met yet)
 * reaches him with warm blooms of message - cryptic, then crisp, ending on the line
 * that sets up why Mom hands him the Swag Deck the next morning. Then the flowers
 * overtake the whole screen and it slowly fades to black, and Bosch wakes up.
 *
 * Rendered as a self-contained screen-space overlay so it never touches world/save
 * state. Canvas renderer: only Graphics fill* primitives (proven to composite) +
 * Sprites are drawn; message text goes through the host's cinematic caption channel.
 */

const OVERLAY_DEPTH = 200_000;
const SKY_BANDS = 20;
const FLOWER_COUNT = 130;
const HOLD_SPEED = 150; // distance units/sec while a direction is held
const DRIFT_SPEED = 34; // slow auto-drift so it can never soft-lock
const STAGE_DISTANCE = [0, 1900, 4000]; // distance at which stages 0/1/2 begin
const FINISH_OVERTAKE_MS = 3600; // flowers swell to fill the screen
const FINISH_FADE_MS = 2400; // then slowly to black

// Warm, dreamlike sky palettes per stage. [skyTop, skyBottom]
const STAGE_SKY: Array<[number, number]> = [
  [0x2a2350, 0x6b5a86], // stage 0: dim dusk purple
  [0x5a4f92, 0xcf90a6], // stage 1: warming rose
  [0xffd27a, 0xffe9b8] // stage 2: radiant gold
];

// ~50+ wildflower species: every (petal-count x hue) pairing, each with its own center
// tint and size, so the field never repeats a look. Built deterministically at load.
interface Species {
  petals: number;
  petalR: number;
  ringR: number;
  color: number;
  center: number;
}
const FLOWER_HUES = [
  0xff9ec4, 0xef8fb0, 0xf4b3d0, 0xffd27a, 0xfff2a8, 0xffe9b8, 0x9be7c4, 0xa6d8c0,
  0x7fd0e8, 0x9ec4ff, 0xb59ac4, 0xc9a8ff, 0xd7a0e8, 0xff8f8f, 0xffb37a, 0xe8f0a0
];
const FLOWER_CENTERS = [0xfff2a8, 0xffd27a, 0xffffff, 0xffe0a0, 0xffc0d8];
const PETAL_COUNTS = [4, 5, 6, 8];
const SPECIES: Species[] = (() => {
  const list: Species[] = [];
  let i = 0;
  for (const petals of PETAL_COUNTS) {
    for (const color of FLOWER_HUES) {
      list.push({
        petals,
        petalR: 1.6 + (i % 3) * 0.7,
        ringR: 2.2 + petals * 0.28,
        color,
        center: FLOWER_CENTERS[i % FLOWER_CENTERS.length]
      });
      i += 1;
    }
  }
  return list; // 4 x 16 = 64 distinct species
})();

interface Flower {
  x: number;
  band: number; // vertical slot in a tall virtual strip
  sizeSeed: number;
  species: number;
}

// Cryptic -> crisp. The final line sets up the Swag Deck hand-off at morning.
const DEFAULT_MESSAGES: string[] = [
  "...Oh. Hey. You can hear me? Huh. That usually doesn't work.",
  "I'm Cloak. We haven't met yet. We're going to. Hi.",
  "This place isn't real, by the way. Well. It's realer than the town you woke up in. That's the sad part.",
  "So there's a thing out there. It copies people. It's honestly super rude about it.",
  "It's been doing this a long time. It doesn't really stop. Try to remember that part.",
  "It got greedy. Started copying whole feelings now. How people talk. What they want. Who they trust.",
  "It already got one of your friends. You'll know which one. I'm sorry.",
  "Here's the weird thing though. It can't copy this. Flowers. A dumb joke. Somebody actually meaning it.",
  "It can't copy me. It couldn't copy you either. That's kind of why I called.",
  "You can't out-fight it. Nobody can. You can out-mean-it, though. Be realer than it. That's the whole trick.",
  "When you wake up, someone's gonna hand you something. Don't lose it. It's the only thing that thing can't fake."
];

export interface MeadowDreamOptions {
  boschTextureKey?: string;
  boschFrame?: number;
  boschWalkFrames?: number[];
  cloakTextureKey?: string;
  cloakFrame?: number;
  messages?: string[];
  onBloom?: () => void; // host fires the warm "understanding" bloom + chime
  onMessage?: (text: string) => void; // host shows the cinematic caption (uiScene)
  onMessageClear?: () => void; // host hides the cinematic caption
  onComplete: () => void;
}

export class MeadowDream {
  private readonly scene: Phaser.Scene;
  private readonly opts: MeadowDreamOptions;
  private readonly messages: string[];
  private container!: Phaser.GameObjects.Container;
  private sky!: Phaser.GameObjects.Graphics;
  private flowersGfx!: Phaser.GameObjects.Graphics;
  private blackRect?: Phaser.GameObjects.Graphics;
  private bosch?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  private cloak?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  private flowers: Flower[] = [];
  private boschWalkFrames: number[] = [];
  private boschAnimClock = 0;
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private distance = 0;
  private messageIndex = 0;
  private finishing = false;
  private finishStartAt = 0;
  private done = false;
  private readonly width: number;
  private readonly height: number;
  private readonly strip: number;

  constructor(scene: Phaser.Scene, opts: MeadowDreamOptions) {
    this.scene = scene;
    this.opts = opts;
    this.messages = opts.messages ?? DEFAULT_MESSAGES;
    this.width = scene.scale.width;
    this.height = scene.scale.height;
    this.strip = this.height + 120;
    this.build();
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
  }

  private build(): void {
    const s = this.scene;
    this.container = s.add.container(0, 0).setDepth(OVERLAY_DEPTH).setScrollFactor(0);
    this.sky = s.add.graphics().setScrollFactor(0);
    this.flowersGfx = s.add.graphics().setScrollFactor(0);
    this.container.add(this.sky);
    this.container.add(this.flowersGfx);

    const bx = Math.round(this.width / 2);
    const by = Math.round(this.height * 0.62);
    if (this.opts.boschTextureKey && s.textures.exists(this.opts.boschTextureKey)) {
      const sprite = s.add
        .sprite(bx, by, this.opts.boschTextureKey, this.opts.boschFrame ?? 0)
        .setScrollFactor(0)
        .setOrigin(0.5, 1);
      sprite.setDisplaySize(34, 34);
      this.bosch = sprite;
      this.boschWalkFrames = this.opts.boschWalkFrames ?? [];
    } else {
      const g = s.add.graphics().setScrollFactor(0);
      g.fillStyle(0x1b1630, 1);
      g.fillRoundedRect(bx - 9, by - 30, 18, 30, 5);
      this.bosch = g;
    }
    this.container.add(this.bosch);

    // Cloak's messages render through the host's cinematic caption channel (uiScene). The
    // world camera does not composite raw Text, so the module draws no text itself.

    for (let i = 0; i < FLOWER_COUNT; i += 1) {
      this.flowers.push({
        x: this.hash(i, 1) * this.width,
        band: this.hash(i, 2) * this.strip,
        sizeSeed: this.hash(i, 3),
        species: Math.floor(this.hash(i, 5) * SPECIES.length) % SPECIES.length
      });
    }

    const kb = s.input.keyboard;
    if (kb) {
      this.keys = [
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.W,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.S,
        Phaser.Input.Keyboard.KeyCodes.A,
        Phaser.Input.Keyboard.KeyCodes.D
      ].map((code) => kb.addKey(code));
    }
  }

  /** Stable pseudo-random in [0,1) from an integer index + salt. */
  private hash(i: number, salt: number): number {
    const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  private stageProgress(): { stage: number; t: number } {
    if (this.distance >= STAGE_DISTANCE[2]) {
      return { stage: 2, t: 1 };
    }
    if (this.distance >= STAGE_DISTANCE[1]) {
      return { stage: 1, t: (this.distance - STAGE_DISTANCE[1]) / (STAGE_DISTANCE[2] - STAGE_DISTANCE[1]) };
    }
    return { stage: 0, t: this.distance / STAGE_DISTANCE[1] };
  }

  private lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const r = Math.round(ar + (((b >> 16) & 0xff) - ar) * t);
    const g = Math.round(ag + (((b >> 8) & 0xff) - ag) * t);
    const bl = Math.round(ab + ((b & 0xff) - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }

  private held(): boolean {
    return this.keys.some((k) => k.isDown);
  }

  /** How far into the flowers-overtake-the-screen phase (0..1). */
  private overtake(time: number): number {
    if (!this.finishing) {
      return 0;
    }
    return Phaser.Math.Clamp((time - this.finishStartAt) / FINISH_OVERTAKE_MS, 0, 1);
  }

  private onUpdate(time: number, delta: number): void {
    if (this.done) {
      return;
    }
    const dt = delta / 1000;
    if (!this.finishing) {
      this.distance += (this.held() ? HOLD_SPEED : DRIFT_SPEED) * dt;
    }
    this.renderSky(time);
    this.renderFlowers(time);
    this.bobBosch(time, delta);
    this.tickMessages(time);
    this.tickFinish(time);
    if (import.meta.env.DEV) {
      (globalThis as Record<string, unknown>).__meadowDreamDebug = {
        distance: Math.round(this.distance),
        stage: this.stageProgress().stage,
        messageIndex: this.messageIndex,
        finishing: this.finishing,
        overtake: Number(this.overtake(time).toFixed(2))
      };
    }
  }

  private renderSky(time: number): void {
    const { stage, t } = this.stageProgress();
    const next = STAGE_SKY[Math.min(stage + 1, STAGE_SKY.length - 1)];
    const cur = STAGE_SKY[stage];
    const top = this.lerpColor(cur[0], next[0], t);
    const bottom = this.lerpColor(cur[1], next[1], t);
    this.sky.clear();
    const bandH = this.height / SKY_BANDS;
    for (let i = 0; i < SKY_BANDS; i += 1) {
      this.sky.fillStyle(this.lerpColor(top, bottom, i / (SKY_BANDS - 1)), 1);
      this.sky.fillRect(0, Math.floor(i * bandH), this.width, Math.ceil(bandH) + 1);
    }
  }

  private renderFlowers(time: number): void {
    const { stage, t } = this.stageProgress();
    const overtake = this.overtake(time);
    // Vividness ramps as the dream deepens; the overtake phase pushes it fully saturated.
    const vivid = Phaser.Math.Clamp(0.5 + 0.5 * (stage / 2 + (stage < 2 ? t / 2 : 0)) + overtake, 0, 1);
    // Density ramps with stage, then every flower shows during the overtake.
    const baseVisible = Math.round(FLOWER_COUNT * (0.4 + 0.6 * (stage / 2 + (stage < 2 ? t / 2 : 0))));
    const visible = Math.round(baseVisible + (FLOWER_COUNT - baseVisible) * overtake);
    const sizeBoost = 1 + overtake * overtake * 5.5; // swell to overtake the screen
    const g = this.flowersGfx;
    g.clear();
    for (let i = 0; i < visible; i += 1) {
      const f = this.flowers[i];
      const y = ((f.band + this.distance) % this.strip) - 60;
      if (y < -30 || y > this.height + 30) {
        continue;
      }
      const depth = Phaser.Math.Clamp(y / this.height, 0, 1);
      const scale = (0.9 + f.sizeSeed * 1.4) * (0.55 + depth) * sizeBoost;
      this.drawFlower(g, SPECIES[f.species], f.x, y, scale, vivid);
    }
  }

  private drawFlower(
    g: Phaser.GameObjects.Graphics,
    sp: Species,
    cx: number,
    cy: number,
    scale: number,
    alpha: number
  ): void {
    const ring = sp.ringR * scale;
    const petalR = sp.petalR * scale;
    g.fillStyle(sp.color, 0.92 * alpha);
    for (let p = 0; p < sp.petals; p += 1) {
      const ang = (p / sp.petals) * Math.PI * 2;
      g.fillCircle(cx + Math.cos(ang) * ring, cy + Math.sin(ang) * ring, petalR);
    }
    g.fillStyle(sp.center, 0.96 * alpha);
    g.fillCircle(cx, cy, Math.max(1, petalR * 0.85));
  }

  private bobBosch(time: number, delta: number): void {
    if (!this.bosch) {
      return;
    }
    this.bosch.y = Math.round(this.height * 0.62) + Math.sin(time / 120) * 1.5;
    if (this.bosch instanceof Phaser.GameObjects.Sprite && this.boschWalkFrames.length > 1) {
      this.boschAnimClock += delta * (this.held() ? 1.6 : 0.7);
      const idx = Math.floor(this.boschAnimClock / 160) % this.boschWalkFrames.length;
      this.bosch.setFrame(this.boschWalkFrames[idx]);
    }
  }

  private tickMessages(time: number): void {
    if (this.finishing) {
      return;
    }
    const gate = (this.messageIndex + 1) * 520;
    if (this.messageIndex < this.messages.length && this.distance >= gate) {
      const isLast = this.messageIndex === this.messages.length - 1;
      this.opts.onMessage?.(this.messages[this.messageIndex]);
      this.opts.onBloom?.();
      this.messageIndex += 1;
      if (isLast) {
        this.beginFinish(time);
      }
    }
  }

  private beginFinish(time: number): void {
    this.finishing = true;
    this.finishStartAt = time;
    this.opts.onBloom?.();
    // Cloak fades in ahead as the flowers begin to swell.
    const cx = Math.round(this.width / 2);
    const cy = Math.round(this.height * 0.44);
    if (this.opts.cloakTextureKey && this.scene.textures.exists(this.opts.cloakTextureKey)) {
      const sprite = this.scene.add
        .sprite(cx, cy, this.opts.cloakTextureKey, this.opts.cloakFrame ?? 0)
        .setScrollFactor(0)
        .setOrigin(0.5, 1)
        .setAlpha(0);
      sprite.setDisplaySize(38, 38);
      this.cloak = sprite;
    } else {
      const g = this.scene.add.graphics().setScrollFactor(0).setAlpha(0);
      g.fillStyle(0xfff2c8, 1);
      g.fillRoundedRect(cx - 10, cy - 34, 20, 34, 6);
      this.cloak = g;
    }
    this.container.add(this.cloak);
    this.scene.tweens.add({ targets: this.cloak, alpha: 1, duration: 900, ease: "Sine.easeIn" });
    // Black curtain drawn on top of everything in the container.
    this.blackRect = this.scene.add.graphics().setScrollFactor(0);
    this.container.add(this.blackRect);
  }

  private tickFinish(time: number): void {
    if (!this.finishing || !this.blackRect) {
      return;
    }
    const elapsed = time - this.finishStartAt;
    const fadeT = Phaser.Math.Clamp((elapsed - FINISH_OVERTAKE_MS) / FINISH_FADE_MS, 0, 1);
    this.blackRect.clear();
    if (fadeT > 0) {
      this.opts.onMessageClear?.();
      this.blackRect.fillStyle(0x000000, fadeT);
      this.blackRect.fillRect(0, 0, this.width, this.height);
    }
    if (fadeT >= 1) {
      this.finish();
    }
  }

  /** External escape hatch (e.g. a skip key): jump straight to the fade-out. */
  skip(time = 0): void {
    if (!this.done && !this.finishing) {
      this.beginFinish(time);
      this.finishStartAt = -FINISH_OVERTAKE_MS; // fade immediately
    }
  }

  private finish(): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.keys.forEach((k) => k.destroy());
    this.opts.onMessageClear?.();
    // Hold black through the handoff: lock the camera black, drop the overlay under it, then
    // reveal the morning (Bosch wakes up).
    const cam = this.scene.cameras.main;
    cam.fadeOut(0, 0, 0, 0);
    this.container.destroy(true);
    this.opts.onComplete();
    cam.fadeIn(1400, 0, 0, 0);
  }
}
