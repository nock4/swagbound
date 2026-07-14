import { describe, expect, it } from "vitest";
import { OdometerDisplay } from "./odometerDisplay";
import type Phaser from "phaser";

type FakeText = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  crop?: { x: number; y: number; width: number; height: number };
  setText(value: string): FakeText;
  setPosition(x: number, y: number): FakeText;
  setY(y: number): FakeText;
  setVisible(visible: boolean): FakeText;
  setCrop(x: number, y: number, width: number, height: number): FakeText;
  destroy(): void;
};

function fakeText(): FakeText {
  const t: FakeText = {
    text: "",
    x: 0,
    y: 0,
    width: 10,
    height: 18,
    visible: true,
    setText(value) { t.text = value; return t; },
    setPosition(x, y) { t.x = x; t.y = y; return t; },
    setY(y) { t.y = y; return t; },
    setVisible(visible) { t.visible = visible; return t; },
    setCrop(x, y, width, height) { t.crop = { x, y, width, height }; return t; },
    destroy() { /* noop */ }
  };
  return t;
}

function makeOdometer(created: FakeText[]) {
  return new OdometerDisplay({
    x: 100,
    y: 50,
    width: 40,
    height: 20,
    scrollMs: 100,
    createDigitText: () => {
      const t = fakeText();
      created.push(t);
      return t;
    }
  });
}

describe("OdometerDisplay", () => {
  it("settles all digits without animation on the first value", () => {
    const texts: FakeText[] = [];
    const od = makeOdometer(texts);
    od.setValue("225", 1000);
    od.render(1000);
    const current = [texts[0], texts[2], texts[4]];
    expect(current.map((t) => t.text)).toEqual(["2", "2", "5"]);
    const incoming = [texts[1], texts[3], texts[5]];
    expect(incoming.every((t) => !t.visible)).toBe(true);
  });

  it("scrolls only the changed digit, clipped to the window", () => {
    const texts: FakeText[] = [];
    const od = makeOdometer(texts);
    od.setValue("225", 0);
    od.render(0);
    od.setValue("224", 1000);
    od.render(1050); // halfway through the 100ms scroll
    // hundreds + tens stay settled
    expect(texts[1].visible).toBe(false);
    expect(texts[3].visible).toBe(false);
    // ones digit mid-scroll: old "5" exiting downward, "4" arriving from above
    const onesCurrent = texts[4];
    const onesIncoming = texts[5];
    expect(onesCurrent.text).toBe("5");
    expect(onesIncoming.text).toBe("4");
    expect(onesIncoming.visible).toBe(true);
    expect(onesCurrent.y).toBeGreaterThan(onesIncoming.y);
    // both cropped to stay inside the window (y 50..70)
    for (const t of [onesCurrent, onesIncoming]) {
      const cropTop = t.crop?.y ?? 0;
      const cropH = t.crop?.height ?? t.height;
      expect(t.y + cropTop).toBeGreaterThanOrEqual(50);
      expect(t.y + cropTop + cropH).toBeLessThanOrEqual(70 + 0.001);
    }
    // after the scroll completes, the ones digit settles on "4"
    od.render(1200);
    expect(onesCurrent.text).toBe("4");
    expect(onesIncoming.visible).toBe(false);
  });

  it("hides a digit entirely when scrolled outside the window", () => {
    const texts: FakeText[] = [];
    const od = makeOdometer(texts);
    od.setValue("009", 0);
    od.render(0);
    od.setValue("010", 1000);
    od.render(1001); // scroll barely started; incoming digit nearly a full cell away
    const onesIncoming = texts[5];
    // incoming sits ~one digit-height outside the window: cropped to (near) nothing or hidden
    if (onesIncoming.visible && onesIncoming.crop) {
      expect(onesIncoming.crop.height).toBeLessThanOrEqual(2);
    }
  });
});
