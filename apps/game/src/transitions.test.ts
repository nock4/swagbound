import { describe, expect, it } from "vitest";
import { drawSwirl, swirlMask, type SwirlGraphics } from "./transitions";

describe("swirlMask", () => {
  it("progress 0 = fully covered (black), not clear", () => {
    const m = swirlMask(0);
    expect(m.fullyCovered).toBe(true);
    expect(m.clear).toBe(false);
    expect(m.baseAlpha).toBeCloseTo(1);
  });
  it("progress 1 = clear (overworld/battle visible)", () => {
    const m = swirlMask(1);
    expect(m.clear).toBe(true);
    expect(m.coverage).toBeCloseTo(0);
  });
  it("mid progress is partial (arms + bands present)", () => {
    const m = swirlMask(0.5);
    expect(m.clear).toBe(false);
    expect(m.fullyCovered).toBe(false);
    expect(m.armCount).toBeGreaterThan(0);
    expect(m.bandCount).toBeGreaterThan(0);
  });
  it("clamps non-finite/out-of-range progress", () => {
    expect(swirlMask(Number.NaN).fullyCovered).toBe(true);
    expect(swirlMask(5).clear).toBe(true);
  });
});

/** Records the graphics calls so we can assert what drawSwirl drew. */
function recorder() {
  const calls = { fillRect: 0, fillPath: 0, strokePath: 0, fills: [] as number[] };
  const g: SwirlGraphics = {
    fillStyle: (c) => { calls.fills.push(c); return g; },
    fillRect: () => { calls.fillRect += 1; return g; },
    beginPath: () => g, moveTo: () => g, lineTo: () => g, closePath: () => g,
    fillPath: () => { calls.fillPath += 1; return g; },
    lineStyle: () => g, strokePath: () => { calls.strokePath += 1; return g; }
  };
  return { g, calls };
}

describe("drawSwirl", () => {
  it("draws nothing when clear (progress 1)", () => {
    const { g, calls } = recorder();
    drawSwirl(g, 1, 512, 448);
    expect(calls.fillRect).toBe(0);
    expect(calls.fillPath).toBe(0);
  });
  it("draws only the black base when fully covered (progress 0)", () => {
    const { g, calls } = recorder();
    drawSwirl(g, 0, 512, 448);
    expect(calls.fillRect).toBe(1); // base darken fill
    expect(calls.fillPath).toBe(0); // no bands (covered)
  });
  it("draws colored bands + highlights mid-transition", () => {
    const { g, calls } = recorder();
    drawSwirl(g, 0.5, 512, 448, { clockMs: 1000 });
    expect(calls.fillRect).toBe(1);
    expect(calls.fillPath).toBeGreaterThan(4);     // many spiral band quads
    expect(calls.strokePath).toBeGreaterThan(0);   // arm highlights
    // colors vary (not a single flat color) -> it's the multicolor swirl
    const uniqueBandColors = new Set(calls.fills).size;
    expect(uniqueBandColors).toBeGreaterThan(3);
  });
});
