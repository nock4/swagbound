export type OdometerDigitText = {
  width: number;
  height: number;
  setText(value: string): OdometerDigitText;
  setPosition(x: number, y: number): OdometerDigitText;
  setY(y: number): OdometerDigitText;
  setVisible(visible: boolean): OdometerDigitText;
  setCrop(x: number, y: number, width: number, height: number): OdometerDigitText;
  destroy(): void;
};

export type OdometerDisplayOptions = {
  /** Top-left of the digit window (the meter box interior), world coords. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Factory producing one styled single-character Text (already positioned off-screen). */
  createDigitText: () => OdometerDigitText;
  digitCount?: number;
  /** Per-digit-change scroll duration in ms. */
  scrollMs?: number;
};

type DigitSlot = {
  char: string;
  prevChar: string;
  animStartMs: number;
  current: OdometerDigitText;
  incoming: OdometerDigitText;
};

const DEFAULT_SCROLL_MS = 90;

/**
 * EarthBound-style odometer digit wheels for the battle HP/PP meters.
 *
 * The rolling VALUE already exists (rollingMeter.ts steps `displayed` toward
 * `target` at the ROM-truth hp-meter speeds); this renders each digit as a
 * vertical wheel scrolling between characters instead of snapping.
 *
 * Implementation note: the game runs Phaser's CANVAS renderer, where geometry
 * masks and RenderTexture stamping are unreliable (RT.draw of Text no-ops;
 * see the Canvas-render gotchas). Text.setCrop IS canvas-safe (drawImage
 * source rect), so each digit is a pair of Texts cropped to the meter window.
 */
export class OdometerDisplay {
  private readonly windowRect: { x: number; y: number; width: number; height: number };
  private readonly digitCount: number;
  private readonly scrollMs: number;
  private readonly digitWidth: number;
  private readonly digitHeight: number;
  private readonly baseY: number;
  private readonly slots: DigitSlot[];
  private lastValue = Number.NaN;
  private direction: 1 | -1 = -1;

  constructor(options: OdometerDisplayOptions) {
    this.windowRect = { x: options.x, y: options.y, width: options.width, height: options.height };
    this.digitCount = Math.max(1, Math.floor(options.digitCount ?? 3));
    this.scrollMs = Math.max(16, Math.floor(options.scrollMs ?? DEFAULT_SCROLL_MS));
    const probe = options.createDigitText();
    probe.setText("0");
    this.digitWidth = Math.ceil(probe.width);
    this.digitHeight = Math.ceil(probe.height);
    this.baseY = this.windowRect.y + Math.floor((this.windowRect.height - this.digitHeight) / 2);
    const startX = this.windowRect.x + Math.max(0, this.windowRect.width - this.digitCount * this.digitWidth - 2);
    this.slots = Array.from({ length: this.digitCount }, (_, index) => {
      const current = index === 0 ? probe : options.createDigitText();
      const incoming = options.createDigitText();
      const x = startX + index * this.digitWidth;
      current.setText("0").setPosition(x, this.baseY);
      incoming.setText("0").setPosition(x, this.baseY).setVisible(false);
      return { char: "0", prevChar: "0", animStartMs: 0, current, incoming };
    });
  }

  /** Zero-padded value string (formatCleanOdometerValue output). */
  setValue(padded: string, nowMs: number): void {
    const chars = padded.slice(-this.digitCount).padStart(this.digitCount, "0");
    const numeric = Number(chars);
    const first = !Number.isFinite(this.lastValue);
    if (!first && numeric !== this.lastValue) {
      this.direction = numeric < this.lastValue ? -1 : 1;
    }
    this.lastValue = numeric;
    for (let index = 0; index < this.digitCount; index += 1) {
      const slot = this.slots[index];
      const char = chars[index] ?? "0";
      if (char === slot.char) {
        continue;
      }
      slot.prevChar = slot.char;
      slot.char = char;
      slot.animStartMs = first ? 0 : nowMs;
    }
  }

  /** Position the wheels; call once per frame while the battle HUD renders. */
  render(nowMs: number): void {
    for (const slot of this.slots) {
      const progress = slot.animStartMs > 0
        ? Math.min(1, (nowMs - slot.animStartMs) / this.scrollMs)
        : 1;
      if (progress >= 1) {
        slot.current.setText(slot.char);
        this.place(slot.current, this.baseY);
        slot.incoming.setVisible(false);
        continue;
      }
      // Counting down: the incoming digit scrolls in from above while the old
      // digit exits below; counting up mirrors it.
      const offset = this.direction === -1
        ? this.digitHeight * progress
        : -this.digitHeight * progress;
      slot.current.setText(slot.prevChar);
      this.place(slot.current, this.baseY + offset);
      slot.incoming.setText(slot.char).setVisible(true);
      this.place(slot.incoming, this.baseY + offset - Math.sign(offset || 1) * this.digitHeight);
    }
  }

  setVisible(visible: boolean): void {
    for (const slot of this.slots) {
      slot.current.setVisible(visible);
      if (!visible) {
        slot.incoming.setVisible(false);
      }
    }
  }

  destroy(): void {
    for (const slot of this.slots) {
      slot.current.destroy();
      slot.incoming.destroy();
    }
  }

  /** Move a digit to y and crop it to the meter window (texture-frame coords). */
  private place(text: OdometerDigitText, y: number): void {
    const top = this.windowRect.y;
    const bottom = this.windowRect.y + this.windowRect.height;
    const cropTop = Math.max(0, top - y);
    const cropBottom = Math.min(this.digitHeight, bottom - y);
    if (cropBottom <= cropTop) {
      text.setVisible(false);
      return;
    }
    text.setVisible(true);
    text.setY(y);
    text.setCrop(0, cropTop, text.width, cropBottom - cropTop);
  }
}
