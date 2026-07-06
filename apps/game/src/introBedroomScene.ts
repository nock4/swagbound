import Phaser from "phaser";
import { publishDebug } from "./state";
import { CANCEL_KEY_NAMES, CONFIRM_KEY_NAMES, registerDiscreteKeys } from "./inputModel";

/**
 * EB-faithful bedroom opening cinematic. Runs on NEW GAME right after the Act-1
 * dossier ("...a cold signal on the sill, and a cleaner version of you already
 * downstairs...") and before the world. A night bedroom, composed in-scene so it
 * never depends on locating the map interior: Bosch asleep, a cold signal pulses
 * at the window, it flares (flash + shake), and he wakes. Then it hands off to the
 * world (which still runs the in-game knock beat). Skippable with Z; skipped on
 * Continue / ?nointro (which never route through here).
 */
type BoschSprite = {
  image: string;
  frameWidth: number;
  frameHeight: number;
  downFrame: number;
};

type IntroBedroomData = {
  nextSceneKey?: string;
  nextSceneData?: object;
  bosch?: BoschSprite;
};

const BOSCH_FALLBACK: BoschSprite = {
  image: "assets/swagbound/hero/bosch-hood-walk.png",
  frameWidth: 96,
  frameHeight: 96,
  downFrame: 0
};

const BOSCH_KEY = "intro-bedroom-bosch";
const MONO = "Menlo, Consolas, monospace";

// Layout (logical 512x448).
const FLOOR_Y = 250;
const WIN = { x: 300, y: 62, w: 138, h: 124 };
const BED = { x: 52, y: 256, w: 214, h: 138 };
// Bosch: asleep lying on the bed, then standing at the bed's foot.
const BOSCH_SLEEP = { x: BED.x + BED.w - 58, y: BED.y + 40, angle: 90, scale: 0.42, alpha: 0.85 };
const BOSCH_WAKE = { x: BED.x + BED.w + 34, y: FLOOR_Y + 118, angle: 0, scale: 0.42, alpha: 1 };

// Phase schedule (ms, cumulative handled in update).
const PH = {
  sleep: 1900,
  signal: 2100,
  flare: 520,
  wake: 1500,
  caption: 3200
};

type Phase = "sleep" | "signal" | "flare" | "wake" | "caption" | "done";

export class IntroBedroomScene extends Phaser.Scene {
  private nextSceneKey = "chunked-world";
  private nextSceneData?: object;
  private bosch: BoschSprite = BOSCH_FALLBACK;

  private phase: Phase = "sleep";
  private elapsed = 0;
  private total = 0;
  private finalized = false;

  private room?: Phaser.GameObjects.Graphics;
  private signal?: Phaser.GameObjects.Graphics;
  private glow?: Phaser.GameObjects.Graphics;
  private flash?: Phaser.GameObjects.Graphics;
  private boschSprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  private caption?: Phaser.GameObjects.Text;
  private skipHint?: Phaser.GameObjects.Text;
  private shook = false;

  constructor() {
    super("intro-bedroom");
  }

  init(data: IntroBedroomData = {}): void {
    this.nextSceneKey = data.nextSceneKey ?? "chunked-world";
    this.nextSceneData = data.nextSceneData;
    this.bosch = data.bosch ?? BOSCH_FALLBACK;
    this.phase = "sleep";
    this.elapsed = 0;
    this.total = 0;
    this.finalized = false;
    this.shook = false;
  }

  preload(): void {
    if (!this.textures.exists(BOSCH_KEY)) {
      this.load.spritesheet(BOSCH_KEY, `/${this.bosch.image}`, {
        frameWidth: this.bosch.frameWidth,
        frameHeight: this.bosch.frameHeight
      });
    }
  }

  create(): void {
    try {
      this.cameras.main.setBackgroundColor("#05060c");
      this.room = this.add.graphics().setDepth(1);
      this.drawRoom();

      this.glow = this.add.graphics().setDepth(2); // cyan signal light cast over the room
      this.signal = this.add.graphics().setDepth(3); // the signal point in the window
      this.boschSprite = this.spawnBosch();
      this.flash = this.add.graphics().setDepth(8);

      this.caption = this.add
        .text(this.scale.width / 2, this.scale.height - 54, "", {
          fontFamily: MONO,
          fontSize: "14px",
          color: "#f2d59b",
          align: "center",
          lineSpacing: 5,
          wordWrap: { width: this.scale.width - 96 }
        })
        .setOrigin(0.5)
        .setDepth(9)
        .setAlpha(0);

      this.skipHint = this.add
        .text(this.scale.width - 14, this.scale.height - 12, "Z  skip", {
          fontFamily: MONO,
          fontSize: "11px",
          color: "#5a6472"
        })
        .setOrigin(1, 1)
        .setDepth(9);

      registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.skip());
      registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.skip());
      this.input.on("pointerdown", () => this.skip());

      this.cameras.main.fadeIn(600, 0, 0, 0);
      this.publish();
    } catch (error) {
      this.fallback(error);
    }
  }

  update(_: number, deltaMs: number): void {
    if (this.finalized) {
      return;
    }
    try {
      this.elapsed += deltaMs;
      this.total += deltaMs;
      this.stepPhase();
      this.drawSignal();
      this.drawGlow();
      this.blinkSkip();
    } catch (error) {
      this.fallback(error);
    }
  }

  private stepPhase(): void {
    const dur = PH[this.phase as keyof typeof PH];
    if (this.phase === "flare" && !this.shook && this.elapsed > 60) {
      this.shook = true;
      this.cameras.main.shake(360, 0.012);
    }
    if (this.phase === "wake" && this.elapsed < 40) {
      this.wakeBosch();
    }
    if (this.phase === "caption" && this.elapsed < 40) {
      this.caption?.setText(
        "A cold signal on the sill.\nBosch wakes up wrong. Unfinished. Still his."
      );
    }
    if (dur === undefined || this.elapsed < dur) {
      // Caption fade-in during its phase.
      if (this.phase === "caption") {
        this.caption?.setAlpha(Math.min(1, this.elapsed / 700));
      }
      return;
    }
    this.elapsed = 0;
    const order: Phase[] = ["sleep", "signal", "flare", "wake", "caption", "done"];
    this.phase = order[Math.min(order.length - 1, order.indexOf(this.phase) + 1)];
    if (this.phase === "done") {
      this.complete();
    }
  }

  private drawRoom(): void {
    const g = this.room;
    if (!g) {
      return;
    }
    const w = this.scale.width;
    const h = this.scale.height;
    g.clear();
    // Wall (night indigo) + a lower wainscot band.
    g.fillStyle(0x241f3a, 1).fillRect(0, 0, w, FLOOR_Y);
    g.fillStyle(0x2c2650, 1).fillRect(0, FLOOR_Y - 26, w, 26);
    g.fillStyle(0x171331, 1).fillRect(0, FLOOR_Y - 3, w, 3);
    // Floor (dark wood) with plank lines + a rug.
    g.fillStyle(0x39291f, 1).fillRect(0, FLOOR_Y, w, h - FLOOR_Y);
    g.lineStyle(1, 0x2c1f18, 0.7);
    for (let x = 0; x < w; x += 40) {
      g.lineBetween(x, FLOOR_Y, x - 60, h);
    }
    g.fillStyle(0x4a2f3e, 1).fillRect(150, 372, 260, 60);
    g.fillStyle(0x5c3a4c, 1).fillRect(160, 380, 240, 44);

    // Window frame + night sky.
    g.fillStyle(0x4a3f36, 1).fillRect(WIN.x - 8, WIN.y - 8, WIN.w + 16, WIN.h + 16);
    g.fillStyle(0x0a0a20, 1).fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    g.fillStyle(0xbcd0ff, 0.9);
    const stars = [
      [18, 20], [44, 52], [70, 28], [96, 66], [120, 22], [30, 88], [104, 100]
    ];
    for (const [sx, sy] of stars) {
      g.fillRect(WIN.x + sx, WIN.y + sy, 2, 2);
    }
    // Muntin bars.
    g.fillStyle(0x4a3f36, 1);
    g.fillRect(WIN.x + WIN.w / 2 - 2, WIN.y, 4, WIN.h);
    g.fillRect(WIN.x, WIN.y + WIN.h / 2 - 2, WIN.w, 4);
    // Sill.
    g.fillStyle(0x5a4c3e, 1).fillRect(WIN.x - 12, WIN.y + WIN.h + 8, WIN.w + 24, 8);

    // Bed: frame, mattress, blanket (EB red), pillow, headboard.
    g.fillStyle(0x6b4636, 1).fillRect(BED.x, BED.y, BED.w, BED.h); // frame
    g.fillStyle(0x4a3020, 1).fillRect(BED.x, BED.y, 16, BED.h); // headboard post (left)
    g.fillStyle(0xcfc2b0, 1).fillRect(BED.x + 16, BED.y + 10, BED.w - 26, BED.h - 24); // mattress
    g.fillStyle(0xb5473f, 1).fillRect(BED.x + 16, BED.y + 44, BED.w - 26, BED.h - 58); // blanket
    g.fillStyle(0xd98c3f, 1).fillRect(BED.x + 16, BED.y + 44, BED.w - 26, 6); // blanket trim
    g.fillStyle(0xe8e4dc, 1).fillRect(BED.x + 26, BED.y + 16, 58, 30); // pillow

    // Desk + lamp (right).
    g.fillStyle(0x5a4030, 1).fillRect(432, 214, 64, 36);
    g.fillStyle(0x8a7a5a, 1).fillRect(460, 176, 6, 40);
    g.fillStyle(0xd8c88a, 1).fillRect(448, 158, 30, 20);
  }

  private spawnBosch(): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    if (this.textures.exists(BOSCH_KEY)) {
      const s = this.add
        .sprite(BOSCH_SLEEP.x, BOSCH_SLEEP.y, BOSCH_KEY, this.bosch.downFrame)
        .setDepth(4)
        .setScale(BOSCH_SLEEP.scale)
        .setAngle(BOSCH_SLEEP.angle)
        .setAlpha(BOSCH_SLEEP.alpha);
      return s;
    }
    // Fallback: a small hooded lump if the sheet failed to load.
    return this.add
      .rectangle(BOSCH_SLEEP.x, BOSCH_SLEEP.y, 40, 22, 0x2a2440)
      .setDepth(4);
  }

  private wakeBosch(): void {
    const s = this.boschSprite;
    if (!s) {
      return;
    }
    s.setPosition(BOSCH_WAKE.x, BOSCH_WAKE.y);
    s.setAlpha(BOSCH_WAKE.alpha);
    if (s instanceof Phaser.GameObjects.Sprite) {
      s.setAngle(BOSCH_WAKE.angle);
      s.setScale(BOSCH_WAKE.scale);
    }
  }

  /** Signal point in the window: dim while sleeping, pulsing brighter through signal/flare. */
  private drawSignal(): void {
    const g = this.signal;
    if (!g) {
      return;
    }
    g.clear();
    const cx = WIN.x + WIN.w - 30;
    const cy = WIN.y + 34;
    let intensity = 0.15;
    if (this.phase === "signal") {
      intensity = 0.2 + 0.8 * (this.elapsed / PH.signal);
    } else if (this.phase === "flare" || this.phase === "wake" || this.phase === "caption") {
      intensity = 1;
    }
    const pulse = 0.7 + 0.3 * Math.sin(this.total / 120);
    const r = 4 + 10 * intensity * pulse;
    g.fillStyle(0x66d8ff, 0.35 * intensity).fillCircle(cx, cy, r * 2.2);
    g.fillStyle(0xaef0ff, 0.7 * intensity).fillCircle(cx, cy, r);
    g.fillStyle(0xffffff, intensity).fillCircle(cx, cy, r * 0.45);
  }

  /** Cyan light the signal casts across the room; peaks at the flare. */
  private drawGlow(): void {
    const g = this.glow;
    if (!g) {
      return;
    }
    g.clear();
    let a = 0;
    if (this.phase === "signal") {
      a = 0.28 * (this.elapsed / PH.signal);
    } else if (this.phase === "flare") {
      a = 0.28 + 0.5 * (this.elapsed / PH.flare);
    } else if (this.phase === "wake") {
      a = 0.32 * (1 - this.elapsed / PH.wake);
    }
    if (a <= 0) {
      return;
    }
    g.fillStyle(0x2fb8e8, a).fillRect(0, 0, this.scale.width, this.scale.height);
    // Bright flash overlay at the flare peak.
    if (this.phase === "flare") {
      const f = Math.max(0, 1 - Math.abs(this.elapsed - PH.flare * 0.5) / (PH.flare * 0.5));
      this.flash?.clear();
      this.flash?.fillStyle(0xffffff, 0.75 * f).fillRect(0, 0, this.scale.width, this.scale.height);
    } else {
      this.flash?.clear();
    }
  }

  private blinkSkip(): void {
    this.skipHint?.setAlpha(Math.sin(this.time.now / 380) > 0 ? 0.55 : 0.2);
  }

  private skip(): void {
    if (!this.finalized) {
      this.complete();
    }
  }

  private complete(): void {
    if (this.finalized) {
      return;
    }
    this.finalized = true;
    this.publish();
    this.cameras.main.fadeOut(420, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start(this.nextSceneKey, this.nextSceneData));
  }

  private fallback(error: unknown): void {
    console.error("Intro bedroom cinematic failed; continuing to world.", error);
    this.finalized = true;
    this.scene.start(this.nextSceneKey, this.nextSceneData);
  }

  private publish(): void {
    publishDebug({
      mode: "intro",
      introActive: !this.finalized,
      introBeatIndex: 0,
      introSkippable: !this.finalized,
      introComplete: this.finalized
    });
  }
}
