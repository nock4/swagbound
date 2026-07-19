import Phaser from "phaser";

/**
 * The pre-wake meadow dream. Bosch holds a direction and walks forever into a
 * wildflower meadow that deepens in stages while Cloak (the ally he has not met yet)
 * reaches him with warm blooms of message - cryptic, then crisp, ending on the line
 * that sets up why Mom hands him the Swag Deck the next morning.
 *
 * Rendered as a self-contained screen-space overlay so it never touches world/save
 * state. The host launches it, the host is told when it is done. Canvas renderer:
 * only Graphics fill* primitives (proven to composite) + Sprites + Text are used.
 */

const OVERLAY_DEPTH = 200_000;
const SKY_BANDS = 20;
const FLOWER_COUNT = 90;
const HOLD_SPEED = 150; // distance units/sec while a direction is held
const DRIFT_SPEED = 34; // slow auto-drift so it can never soft-lock
const STAGE_DISTANCE = [0, 1900, 4000]; // distance at which stages 0/1/2 begin

// Warm, dreamlike palettes per stage. [skyTop, skyBottom, ...flowerColors]
const STAGE_SKY: Array<[number, number]> = [
  [0x2a2350, 0x6b5a86], // stage 0: dim dusk purple
  [0x5a4f92, 0xcf90a6], // stage 1: warming rose
  [0xffd27a, 0xffe9b8] // stage 2: radiant gold
];
const STAGE_FLOWERS: number[][] = [
  [0x8a7fb0, 0xb59ac4, 0x9f86b8],
  [0xef8fb0, 0xffd27a, 0xa6d8c0, 0xf4b3d0],
  [0xffe9b8, 0xff9ec4, 0x9be7c4, 0xfff2a8, 0xc9a8ff]
];

interface Flower {
  x: number;
  band: number; // vertical slot in a tall virtual strip
  sizeSeed: number;
  colorSeed: number;
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
  private bosch?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  private cloak?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  private boschWalkFrames: number[] = [];
  private boschAnimClock = 0;
  private flowers: Flower[] = [];
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private distance = 0;
  private messageIndex = 0;
  private finishing = false;
  private done = false;
  private readonly width: number;
  private readonly height: number;
  private readonly strip: number; // virtual vertical strip height flowers wrap within

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

    // Bosch, back to camera, walking away into the meadow. Reuse the real texture if we
    // have it; otherwise a small hooded silhouette.
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

    // Cloak's messages render through the host's cinematic caption channel (uiScene), the
    // same proven text-over-world path the opening flyover uses. The world scene's main
    // camera does not composite raw Text, so the module does not draw text itself.

    // Deterministic flower field (index-hashed, stable frame to frame).
    for (let i = 0; i < FLOWER_COUNT; i += 1) {
      this.flowers.push({
        x: this.hash(i, 1) * this.width,
        band: this.hash(i, 2) * this.strip,
        sizeSeed: this.hash(i, 3),
        colorSeed: this.hash(i, 4)
      });
    }

    const kb = s.input.keyboard;
    if (kb) {
      this.keys = [
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      ];
    }
  }

  /** Stable pseudo-random in [0,1) from an integer index + salt. No Math.random (stable). */
  private hash(i: number, salt: number): number {
    const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  private stageProgress(): { stage: number; t: number } {
    if (this.distance >= STAGE_DISTANCE[2]) {
      return { stage: 2, t: 1 };
    }
    if (this.distance >= STAGE_DISTANCE[1]) {
      const t = (this.distance - STAGE_DISTANCE[1]) / (STAGE_DISTANCE[2] - STAGE_DISTANCE[1]);
      return { stage: 1, t };
    }
    const t = this.distance / STAGE_DISTANCE[1];
    return { stage: 0, t };
  }

  private lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }

  private held(): boolean {
    return this.keys.some((k) => k.isDown);
  }

  private onUpdate(_time: number, delta: number): void {
    if (this.done) {
      return;
    }
    const dt = delta / 1000;
    if (!this.finishing) {
      this.distance += (this.held() ? HOLD_SPEED : DRIFT_SPEED) * dt;
    }
    this.renderSky();
    this.renderFlowers();
    this.bobBosch(_time, delta);
    this.tickMessages(_time);
    if (import.meta.env.DEV) {
      (globalThis as Record<string, unknown>).__meadowDreamDebug = {
        distance: Math.round(this.distance),
        stage: this.stageProgress().stage,
        messageIndex: this.messageIndex,
        finishing: this.finishing
      };
    }
  }

  private renderSky(): void {
    const { stage, t } = this.stageProgress();
    const next = STAGE_SKY[Math.min(stage + 1, STAGE_SKY.length - 1)];
    const cur = STAGE_SKY[stage];
    const top = this.lerpColor(cur[0], next[0], t);
    const bottom = this.lerpColor(cur[1], next[1], t);
    this.sky.clear();
    const bandH = this.height / SKY_BANDS;
    for (let i = 0; i < SKY_BANDS; i += 1) {
      const bt = i / (SKY_BANDS - 1);
      this.sky.fillStyle(this.lerpColor(top, bottom, bt), 1);
      this.sky.fillRect(0, Math.floor(i * bandH), this.width, Math.ceil(bandH) + 1);
    }
  }

  private renderFlowers(): void {
    const { stage, t } = this.stageProgress();
    const palette = STAGE_FLOWERS[stage];
    const g = this.flowersGfx;
    g.clear();
    // Density ramps with stage: more of the field is drawn as the dream deepens.
    const visible = Math.round(FLOWER_COUNT * (0.45 + 0.55 * (stage / 2 + (t / 2) * (stage < 2 ? 1 : 0))));
    for (let i = 0; i < visible; i += 1) {
      const f = this.flowers[i];
      // Scroll downward as Bosch walks forward; wrap within the virtual strip.
      const y = ((f.band + this.distance) % this.strip) - 60;
      if (y < -20 || y > this.height + 20) {
        continue;
      }
      // Perspective-ish: flowers lower on screen are bigger.
      const depth = Phaser.Math.Clamp(y / this.height, 0, 1);
      const size = (1.5 + f.sizeSeed * 2.5) * (0.5 + depth);
      const color = palette[Math.floor(f.colorSeed * palette.length) % palette.length];
      const cx = f.x;
      // petals
      g.fillStyle(color, 0.92);
      g.fillCircle(cx - size, y, size);
      g.fillCircle(cx + size, y, size);
      g.fillCircle(cx, y - size, size);
      g.fillCircle(cx, y + size, size);
      // center
      g.fillStyle(0xfff2a8, 0.95);
      g.fillCircle(cx, y, size * 0.7);
    }
  }

  private bobBosch(time: number, delta: number): void {
    if (!this.bosch) {
      return;
    }
    const bob = Math.sin(time / 120) * 1.5;
    const baseY = Math.round(this.height * 0.62);
    this.bosch.y = baseY + bob;
    // Alternate the up-walk frames (faster while a direction is held).
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
    // Messages arrive at even distance gates across the walk.
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
    // Cloak fades in ahead, then the dream whites out into morning.
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
    this.scene.time.delayedCall(3600, () => this.whiteOut());
  }

  private whiteOut(): void {
    const flash = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 10);
    flash.fillStyle(0xffffff, 0);
    flash.fillRect(0, 0, this.width, this.height);
    this.container.add(flash);
    this.opts.onMessageClear?.();
    this.opts.onBloom?.();
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1100,
      ease: "Sine.easeIn",
      onUpdate: (tw) => {
        const a = tw.getValue() ?? 0;
        flash.clear();
        flash.fillStyle(0xffffff, a);
        flash.fillRect(0, 0, this.width, this.height);
      },
      onComplete: () => this.finish()
    });
  }

  /** External escape hatch (e.g. a skip key) - white out immediately. */
  skip(): void {
    if (!this.done && !this.finishing) {
      this.finishing = true;
      this.whiteOut();
    }
  }

  private finish(): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.keys.forEach((k) => k.destroy());
    this.container.destroy(true);
    this.opts.onComplete();
  }
}
