import Phaser from "phaser";

/**
 * The pre-wake meadow dream. Bosch holds a direction and walks forever into a
 * wildflower meadow that deepens in stages while Cloak (the ally he has not met yet)
 * reaches him with warm blooms of message - cryptic, then crisp, ending on the line
 * that sets up why Mom hands him the Swag Deck the next morning. Then the flowers
 * overtake the whole screen and it slowly fades to black, and Bosch wakes up.
 *
 * Rendered as a self-contained screen-space overlay so it never touches world/save
 * state. Flowers are real pixel-art sprites (a generated EarthBound-style sheet) drawn
 * nearest-filtered; sky is a Graphics gradient; message text goes through the host's
 * cinematic caption channel.
 */

const OVERLAY_DEPTH = 200_000;
const SKY_BANDS = 20;
const FLOWER_COUNT = 8000;
const FLOWER_BASE_PX = 12; // on-screen size of a flower at scale 1
const HOLD_SPEED = 150; // distance units/sec while a direction is held
const DRIFT_SPEED = 34; // slow auto-drift so it can never soft-lock
const STAGE_DISTANCE = [0, 1900, 4000]; // distance at which stages 0/1/2 begin
const FINISH_OVERTAKE_MS = 3600; // flowers swell to fill the screen
const FINISH_FADE_MS = 2400; // then slowly to black
// A narrow clear pathway down the middle; Bosch walks it left-to-right, flowers flank it.
const PATH_CENTER_FRAC = 0.55;
const PATH_HALF_PX = 30;

// Warm, dreamlike sky palettes per stage. [skyTop, skyBottom]
const STAGE_SKY: Array<[number, number]> = [
  [0x2a2350, 0x6b5a86], // stage 0: dim dusk purple
  [0x5a4f92, 0xcf90a6], // stage 1: warming rose
  [0xffd27a, 0xffe9b8] // stage 2: radiant gold
];

interface Flower {
  sprite: Phaser.GameObjects.Image;
  baseX: number; // position along the horizontal scroll strip
  y: number; // fixed vertical position (in the top or bottom flower band)
  sizeSeed: number;
}

const BUTTERFLY_COUNT = 6;
interface Butterfly {
  sprite: Phaser.GameObjects.Image;
  variant: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  scale: number;
  flap: number; // 0 open, 1 closed
}

// Cryptic -> crisp. The final line sets up the Swag Deck hand-off at morning.
const DEFAULT_MESSAGES: string[] = [
  "...Oh. Hey. You can hear me? Huh. That usually doesn't work.",
  "I'm Cloak. We haven't met yet. We will soon.",
  "This place isn't real, by the way. Well. It's realer than the town you woke up in. That's the sad part.",
  "So there's a thing out there. It makes derivatives. Nothing is sacred.",
  "It's been doing this a long time. It doesn't really stop. Try to remember that part.",
  "It's greedy.",
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
  flowerTextureKey?: string;
  flowerFrameCount?: number;
  butterflyTextureKey?: string;
  butterflyVariants?: number;
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
  private blackRect?: Phaser.GameObjects.Graphics;
  private bosch?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  private cloak?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  private flowers: Flower[] = [];
  private butterflies: Butterfly[] = [];
  private motesGfx?: Phaser.GameObjects.Graphics;
  private motes: Array<{ x: number; y: number; r: number; vy: number; phase: number }> = [];
  private flowerEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
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
  private readonly stripX: number;

  constructor(scene: Phaser.Scene, opts: MeadowDreamOptions) {
    this.scene = scene;
    this.opts = opts;
    this.messages = opts.messages ?? DEFAULT_MESSAGES;
    this.width = scene.scale.width;
    this.height = scene.scale.height;
    this.stripX = this.width * 2; // dense on-screen carpet, scrolls without obvious repeat
    this.build();
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
  }

  private build(): void {
    const s = this.scene;
    this.container = s.add.container(0, 0).setDepth(OVERLAY_DEPTH).setScrollFactor(0);
    this.sky = s.add.graphics().setScrollFactor(0);
    this.container.add(this.sky);

    // Flower sprites: a generated EarthBound-style sheet, drawn crisp (nearest filter).
    const key = this.opts.flowerTextureKey;
    const frames = Math.max(1, this.opts.flowerFrameCount ?? 1);
    const pathTop = this.height * PATH_CENTER_FRAC - PATH_HALF_PX;
    const pathBottom = this.height * PATH_CENTER_FRAC + PATH_HALF_PX;
    if (key && s.textures.exists(key)) {
      s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      for (let i = 0; i < FLOWER_COUNT; i += 1) {
        const frame = Math.floor(this.hash(i, 5) * frames) % frames;
        const frameName = s.textures.get(key).has(`flower-${frame}`) ? `flower-${frame}` : frame;
        const img = s.add
          .image(0, 0, key, frameName)
          .setScrollFactor(0)
          .setOrigin(0.5, 0.7)
          .setVisible(false);
        this.container.add(img);
        // Flank the path: half the flowers in the top band, half in the bottom band.
        const topBand = this.hash(i, 2) < 0.5;
        const yr = this.hash(i, 4);
        const y = topBand ? 6 + yr * (pathTop - 10) : pathBottom + 4 + yr * (this.height - pathBottom - 6);
        this.flowers.push({ sprite: img, baseX: this.hash(i, 1) * this.stripX, y, sizeSeed: this.hash(i, 3) });
      }
      // Ambient dream-flowers drifting up (a sparse life during the walk; floods into a
      // swarm at the finale). Reuses the same flower frames.
      const frameNames = Array.from({ length: frames }, (_, i) => `flower-${i}`).filter((n) =>
        s.textures.get(key).has(n)
      );
      this.flowerEmitter = s.add
        .particles(0, 0, key, {
          frame: frameNames,
          x: { min: 0, max: this.width },
          y: this.height + 30,
          lifespan: 4200,
          speedY: { min: -70, max: -28 },
          speedX: { min: -34, max: 34 },
          scale: { min: 0.06, max: 0.16 },
          alpha: { start: 0.75, end: 0 },
          rotate: { min: -22, max: 22 },
          frequency: 360,
          quantity: 1
        })
        .setScrollFactor(0)
        .setDepth(this.height + 50);
      this.container.add(this.flowerEmitter);
    }

    // Butterflies flitting over the meadow (2-frame flap, wandering flight).
    const bfKey = this.opts.butterflyTextureKey;
    const variants = Math.max(1, this.opts.butterflyVariants ?? 1);
    if (bfKey && s.textures.exists(bfKey)) {
      s.textures.get(bfKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
      for (let i = 0; i < BUTTERFLY_COUNT; i += 1) {
        const variant = Math.floor(this.hash(i, 6) * variants) % variants;
        const openFrame = `bfly-${variant}-0`;
        const img = s.add
          .image(0, 0, bfKey, s.textures.get(bfKey).has(openFrame) ? openFrame : 0)
          .setScrollFactor(0)
          .setOrigin(0.5, 0.5)
          .setDepth(this.height + 70);
        this.container.add(img);
        const scale = (26 + this.hash(i, 7) * 12) / 348; // normalize to open-wing width
        this.butterflies.push({
          sprite: img,
          variant,
          x: this.hash(i, 1) * this.width,
          y: 20 + this.hash(i, 2) * (this.height - 60),
          vx: (this.hash(i, 8) - 0.4) * 34,
          vy: (this.hash(i, 9) - 0.5) * 22,
          phase: this.hash(i, 10) * Math.PI * 2,
          scale,
          flap: 0
        });
      }
    }

    // Light motes / bokeh: soft glowing dots drifting up through the dream.
    this.motesGfx = s.add.graphics().setScrollFactor(0).setDepth(this.height + 80);
    this.container.add(this.motesGfx);
    for (let i = 0; i < 30; i += 1) {
      this.motes.push({
        x: this.hash(i, 11) * this.width,
        y: this.hash(i, 12) * this.height,
        r: 2 + this.hash(i, 13) * 4,
        vy: 8 + this.hash(i, 14) * 16,
        phase: this.hash(i, 15) * Math.PI * 2
      });
    }

    const bx = Math.round(this.width * 0.44);
    const by = Math.round(this.height * PATH_CENTER_FRAC);
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
    this.updateFlowers(time);
    this.updateMotes(time, dt);
    this.updateButterflies(time, dt);
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
    let top = this.lerpColor(cur[0], next[0], t);
    let bottom = this.lerpColor(cur[1], next[1], t);
    // Pulsing sky: breathe slowly through a warm/cool dream tint so it never holds still.
    const pulse = (Math.sin(time / 3200) + 1) / 2;
    const dreamTint = this.lerpColor(0xff9ec4, 0x9ec4ff, pulse);
    top = this.lerpColor(top, dreamTint, 0.16);
    bottom = this.lerpColor(bottom, dreamTint, 0.1);
    this.sky.clear();
    const bandH = this.height / SKY_BANDS;
    for (let i = 0; i < SKY_BANDS; i += 1) {
      this.sky.fillStyle(this.lerpColor(top, bottom, i / (SKY_BANDS - 1)), 1);
      this.sky.fillRect(0, Math.floor(i * bandH), this.width, Math.ceil(bandH) + 1);
    }
    // The clear pathway Bosch walks: a soft warm dirt lane with faint edge lines.
    const pTop = this.height * PATH_CENTER_FRAC - PATH_HALF_PX;
    const pH = PATH_HALF_PX * 2;
    this.sky.fillStyle(0xdcc79a, 0.22);
    this.sky.fillRect(0, pTop, this.width, pH);
    this.sky.fillStyle(0xb59a6a, 0.28);
    this.sky.fillRect(0, pTop, this.width, 2);
    this.sky.fillRect(0, pTop + pH - 2, this.width, 2);
  }

  private updateFlowers(time: number): void {
    const { stage, t } = this.stageProgress();
    const overtake = this.overtake(time);
    const deepen = stage / 2 + (stage < 2 ? t / 2 : 0);
    const vivid = Phaser.Math.Clamp(0.55 + 0.45 * deepen + overtake, 0, 1);
    const baseVisible = Math.round(FLOWER_COUNT * (0.75 + 0.25 * deepen));
    const visible = Math.round(baseVisible + (FLOWER_COUNT - baseVisible) * overtake);
    const sizeBoost = 1 + overtake * overtake * 6;
    for (let i = 0; i < this.flowers.length; i += 1) {
      const f = this.flowers[i];
      if (i >= visible) {
        f.sprite.setVisible(false);
        continue;
      }
      // Scroll horizontally: the world slides left as Bosch walks right.
      let x = (f.baseX - this.distance) % this.stripX;
      if (x < 0) {
        x += this.stripX;
      }
      x -= 80;
      if (x < -40 || x > this.width + 40) {
        f.sprite.setVisible(false);
        continue;
      }
      // At the finale the flowers close in over the path so they overtake the whole screen.
      const drawY = Phaser.Math.Linear(f.y, this.height * PATH_CENTER_FRAC, overtake * 0.55);
      // Nearer (lower) flowers are bigger and draw in front.
      const depth = Phaser.Math.Clamp(f.y / this.height, 0, 1);
      const target = FLOWER_BASE_PX * (0.55 + f.sizeSeed * 0.5) * (0.6 + depth * 0.8) * sizeBoost;
      const fw = f.sprite.frame.width;
      const fh = f.sprite.frame.height;
      // Dreamlike sway + breathing: each flower drifts and pulses on its own phase.
      const ph = f.sizeSeed * 41.7;
      const sway = Math.sin(time / 900 + ph) * 2.6;
      const bob = Math.cos(time / 1100 + ph) * 1.4;
      const breathe = 1 + Math.sin(time / 1200 + ph) * 0.07;
      f.sprite.setVisible(true);
      f.sprite.setPosition(x + sway, drawY + bob);
      f.sprite.setScale((target * breathe) / Math.max(fw, fh)); // normalize longest side, keep aspect
      f.sprite.setAlpha(vivid);
      f.sprite.setDepth(drawY);
    }
  }

  private updateMotes(time: number, dt: number): void {
    const g = this.motesGfx;
    if (!g) {
      return;
    }
    g.clear();
    for (const m of this.motes) {
      m.y -= m.vy * dt;
      if (m.y < -12) {
        m.y = this.height + 12;
      }
      const x = m.x + Math.sin(time / 1300 + m.phase) * 16;
      const pulse = 0.5 + 0.5 * Math.sin(time / 700 + m.phase);
      const a = 0.16 + 0.18 * pulse;
      g.fillStyle(0xfff2c8, a * 0.5);
      g.fillCircle(x, m.y, m.r * 2.2);
      g.fillStyle(0xffffff, a);
      g.fillCircle(x, m.y, m.r);
      g.fillStyle(0xffffff, Math.min(1, a * 1.6));
      g.fillCircle(x, m.y, m.r * 0.45);
    }
  }

  private updateButterflies(time: number, dt: number): void {
    for (const b of this.butterflies) {
      // Meander: base drift + gentle sine wander on both axes.
      b.x += (b.vx + Math.cos(time / 700 + b.phase) * 22) * dt;
      b.y += (b.vy + Math.sin(time / 500 + b.phase) * 16) * dt;
      // Wrap around the screen edges so they never leave.
      if (b.x < -30) b.x = this.width + 30;
      if (b.x > this.width + 30) b.x = -30;
      if (b.y < -30) b.y = this.height + 30;
      if (b.y > this.height + 30) b.y = -30;
      // 2-frame flap.
      const flap = Math.floor(time / 150 + b.phase * 3) % 2;
      if (flap !== b.flap) {
        b.flap = flap;
        const name = `bfly-${b.variant}-${flap}`;
        if (b.sprite.texture.has(name)) {
          b.sprite.setFrame(name);
        }
      }
      b.sprite.setPosition(Math.round(b.x), Math.round(b.y));
      // Face travel direction (flip when drifting left).
      b.sprite.setScale((b.vx < 0 ? -1 : 1) * b.scale, b.scale);
    }
  }

  private bobBosch(time: number, delta: number): void {
    if (!this.bosch) {
      return;
    }
    const pathY = Math.round(this.height * PATH_CENTER_FRAC);
    this.bosch.y = pathY + Math.sin(time / 120) * 1.5;
    if (this.bosch instanceof Phaser.GameObjects.Sprite && this.boschWalkFrames.length > 1) {
      this.boschAnimClock += delta * (this.held() ? 1.6 : 0.7);
      const idx = Math.floor(this.boschAnimClock / 160) % this.boschWalkFrames.length;
      this.bosch.setFrame(this.boschWalkFrames[idx]);
    }
    this.bosch.setDepth(pathY); // Bosch sorts among the flowers on the path line
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
    // Flood the ambient drift into a swarm as everything blooms over.
    this.flowerEmitter?.setFrequency(24, 3);
    const cx = Math.round(this.width / 2);
    const cy = Math.round(this.height * 0.44);
    if (this.opts.cloakTextureKey && this.scene.textures.exists(this.opts.cloakTextureKey)) {
      const sprite = this.scene.add
        .sprite(cx, cy, this.opts.cloakTextureKey, this.opts.cloakFrame ?? 0)
        .setScrollFactor(0)
        .setOrigin(0.5, 1)
        .setAlpha(0)
        .setDepth(this.height + 100); // above the flowers
      sprite.setDisplaySize(38, 38);
      this.cloak = sprite;
    } else {
      const g = this.scene.add.graphics().setScrollFactor(0).setAlpha(0).setDepth(this.height + 100);
      g.fillStyle(0xfff2c8, 1);
      g.fillRoundedRect(cx - 10, cy - 34, 20, 34, 6);
      this.cloak = g;
    }
    this.container.add(this.cloak);
    this.scene.tweens.add({ targets: this.cloak, alpha: 1, duration: 900, ease: "Sine.easeIn" });
    this.blackRect = this.scene.add.graphics().setScrollFactor(0).setDepth(this.height + 500);
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
      this.finishStartAt = -FINISH_OVERTAKE_MS;
    }
  }

  private finish(): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    // The movement keys are BORROWED, not owned: Phaser's addKey() returns the already
    // registered Key when the world scene created one (its cursors/WASD reference these
    // same objects). Destroying them would tear down the scene's shared input, so drop
    // our reference and leave ownership with the scene.
    this.keys = [];
    this.opts.onMessageClear?.();
    const cam = this.scene.cameras.main;
    cam.fadeOut(0, 0, 0, 0);
    this.container.destroy(true);
    this.opts.onComplete();
    cam.fadeIn(1400, 0, 0, 0);
  }
}
