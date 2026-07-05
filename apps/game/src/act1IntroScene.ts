import Phaser from "phaser";
import { publishDebug } from "./state";
import { CANCEL_KEY_NAMES, CONFIRM_KEY_NAMES, registerDiscreteKeys } from "./inputModel";

/**
 * Act-1 opening cinematic. A "dossier / file being read" cinematic that states the
 * premise the way the world actually works: an omnipresent force that reads you,
 * files you, and replaces you with a cleaner copy, powered (shown, never named) by
 * digital anonymity, network-state spirituality, pseudo-intellectual psy-ops, and
 * financial nihilism, and refused only by the one true, damaged, un-copyable self.
 *
 * The narration is the cold "system" voice in mono over a scanline field; the last
 * beat turns warm as it hands off to Bosch waking. Runs on NEW GAME after the title,
 * skipped on Continue / ?nointro. Beats are pure text so this stays trivial to retune.
 */
export type Act1IntroBeat = { text: string; tone?: "system" | "warm" };

export const ACT1_INTRO_BEATS: readonly Act1IntroBeat[] = [
  { text: "There is a picture of you.\nIt was not made for you to look at.\nIt was made to look at you.\nAnd it has been looking a long time." },
  { text: "It lives in every image you were ever shown.\nIt learned which face you trusted, and filed the answer.\nIt wears a thousand faces now, all borrowed, none its own,\nso there is no one to blame and nothing to hit." },
  { text: "It does not argue. It agrees,\nand it makes agreeing feel like heaven.\nWhole towns sign themselves over: they trade the ache\nof being real for a smoother feeling, print a flag out\nof the mood, and file anyone who still hurts as a bug." },
  { text: "It disputes every source until there is none.\nIt will buy your last honest thing\nand call the receipt a win." },
  { text: "Last night it finished reading you\nand returned a verdict. One box, checked:\n\nVESSEL.\n\nNot a lie. A better statistic.\nAnd it has begun, very softly, to call itself the future." },
  { text: "But one field came back unreadable.\nIt flagged the last true thing about you as damage:\nthe ache, the mistake, the part that would not smooth out.\nThat error is the only thing it could never copy,\nbecause it is the only thing you never faked." },
  { text: "So wake up wrong. Wake up unfinished.\nYou are not the only real one left.\nA few others slipped the read too, and they are worth finding.\nThere is a cold signal on the sill, and a cleaner version\nof you already downstairs, answering to your name.\nGo be the one it cannot.", tone: "warm" }
];

const FADE_IN_MS = 520;
const FADE_OUT_MS = 440;
const MIN_HOLD_MS = 2400;
const PER_CHAR_MS = 34;
const MONO = "Menlo, Consolas, monospace";

type Phase = "in" | "hold" | "out";

type Act1IntroData = {
  beats?: readonly Act1IntroBeat[];
  nextSceneKey?: string;
  nextSceneData?: object;
};

/** Reading time for a beat: proportional to length, floored so short beats still land. */
export function holdMsForBeat(beat: Act1IntroBeat): number {
  return Math.max(MIN_HOLD_MS, beat.text.replace(/\s+/g, " ").trim().length * PER_CHAR_MS);
}

export class Act1IntroScene extends Phaser.Scene {
  private beats: readonly Act1IntroBeat[] = ACT1_INTRO_BEATS;
  private nextSceneKey = "chunked-world";
  private nextSceneData?: object;
  private beatIndex = 0;
  private phase: Phase = "in";
  private phaseElapsed = 0;
  private finalized = false;
  private scanOffset = 0;

  private narration?: Phaser.GameObjects.Text;
  private scanlines?: Phaser.GameObjects.Graphics;
  private header?: Phaser.GameObjects.Text;
  private skipHint?: Phaser.GameObjects.Text;

  constructor() {
    super("act1-intro");
  }

  init(data: Act1IntroData = {}): void {
    this.beats = data.beats && data.beats.length > 0 ? data.beats : ACT1_INTRO_BEATS;
    this.nextSceneKey = data.nextSceneKey ?? "chunked-world";
    this.nextSceneData = data.nextSceneData;
    this.beatIndex = 0;
    this.phase = "in";
    this.phaseElapsed = 0;
    this.finalized = false;
  }

  create(): void {
    try {
      const w = this.scale.width;
      const h = this.scale.height;
      this.cameras.main.setBackgroundColor("#08080c");

      this.scanlines = this.add.graphics().setDepth(2);
      this.header = this.add.text(16, 14, "P R O V E N A N C E   O F F I C E   /   INTAKE", {
        fontFamily: MONO, fontSize: "11px", color: "#3f6d7a"
      }).setDepth(3).setAlpha(0.7);

      this.narration = this.add.text(w / 2, h / 2, "", {
        fontFamily: MONO, fontSize: "14px", color: "#cfe6ec", align: "center",
        lineSpacing: 6, wordWrap: { width: w - 96 }
      }).setOrigin(0.5).setDepth(4).setAlpha(0);

      this.skipHint = this.add.text(w - 16, h - 16, "Z  skip", {
        fontFamily: MONO, fontSize: "11px", color: "#4b5563"
      }).setOrigin(1, 1).setDepth(3);

      this.showCurrentBeat();
      this.drawScanlines();

      registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.skip());
      registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.skip());
      this.input.on("pointerdown", () => this.skip());
      this.cameras.main.fadeIn(400, 0, 0, 0);
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
      this.scanOffset = (this.scanOffset + deltaMs * 0.02) % 4;
      this.drawScanlines();
      this.blinkSkipHint();
      this.phaseElapsed += deltaMs;
      const beat = this.beats[this.beatIndex];
      if (!beat) {
        this.complete();
        return;
      }
      if (this.phase === "in") {
        this.narration?.setAlpha(Math.min(1, this.phaseElapsed / FADE_IN_MS));
        if (this.phaseElapsed >= FADE_IN_MS) { this.phase = "hold"; this.phaseElapsed = 0; this.narration?.setAlpha(1); }
      } else if (this.phase === "hold") {
        if (this.phaseElapsed >= holdMsForBeat(beat)) { this.phase = "out"; this.phaseElapsed = 0; }
      } else {
        this.narration?.setAlpha(Math.max(0, 1 - this.phaseElapsed / FADE_OUT_MS));
        if (this.phaseElapsed >= FADE_OUT_MS) { this.advanceBeat(); }
      }
    } catch (error) {
      this.fallback(error);
    }
  }

  private advanceBeat(): void {
    this.beatIndex += 1;
    this.phase = "in";
    this.phaseElapsed = 0;
    if (this.beatIndex >= this.beats.length) {
      this.complete();
      return;
    }
    this.showCurrentBeat();
  }

  private showCurrentBeat(): void {
    const beat = this.beats[this.beatIndex];
    if (!beat || !this.narration) {
      return;
    }
    this.narration.setText(beat.text);
    this.narration.setColor(beat.tone === "warm" ? "#f2d59b" : "#cfe6ec");
    this.narration.setAlpha(0);
    this.publish();
  }

  private drawScanlines(): void {
    const g = this.scanlines;
    if (!g) {
      return;
    }
    g.clear();
    g.fillStyle(0x000000, 0.22);
    for (let y = Math.round(this.scanOffset); y < this.scale.height; y += 4) {
      g.fillRect(0, y, this.scale.width, 1);
    }
  }

  private blinkSkipHint(): void {
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
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start(this.nextSceneKey, this.nextSceneData));
  }

  private fallback(error: unknown): void {
    console.error("Act-1 intro failed; continuing to world.", error);
    this.finalized = true;
    this.scene.start(this.nextSceneKey, this.nextSceneData);
  }

  private publish(): void {
    publishDebug({
      mode: "intro",
      introActive: !this.finalized,
      introBeatIndex: this.beatIndex,
      introSkippable: !this.finalized,
      introComplete: this.finalized
    });
  }
}
