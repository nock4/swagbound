import { describe, expect, it } from "vitest";
import { defaultVisualStateInputs, resolvePlayerVisualState, type VisualStateInputs } from "./playerVisualState";

const inputs = (over: Partial<VisualStateInputs>): VisualStateInputs => ({ ...defaultVisualStateInputs(), ...over });

describe("resolvePlayerVisualState", () => {
  it("plain walking -> default, no transforms/overlays", () => {
    const r = resolvePlayerVisualState(defaultVisualStateInputs());
    expect(r.baseState).toBe("default");
    expect(r.transforms).toEqual({ invertPalette: false, waterClip: false, teleportSpin: false });
    expect(r.overlays).toEqual([]);
    expect(r.lockAnimation).toBe(false);
  });

  it("KO -> dead with a fade approximation; tiny+KO -> tinyDead", () => {
    expect(resolvePlayerVisualState(inputs({ ko: true })).baseState).toBe("dead");
    expect(resolvePlayerVisualState(inputs({ ko: true })).approximation.alpha).toBe(0.5);
    const td = resolvePlayerVisualState(inputs({ ko: true, status: { tiny: true } }));
    expect(td.baseState).toBe("tinyDead");
    expect(td.approximation).toMatchObject({ scale: 0.55, alpha: 0.5 });
  });

  it("tiny (alive) -> tiny + scale approximation", () => {
    const r = resolvePlayerVisualState(inputs({ status: { tiny: true } }));
    expect(r.baseState).toBe("tiny");
    expect(r.approximation.scale).toBe(0.55);
  });

  it("priority: KO beats bike beats ladder beats rope beats tiny", () => {
    expect(resolvePlayerVisualState(inputs({ ko: true, riding: "bike", onLadder: true })).baseState).toBe("dead");
    expect(resolvePlayerVisualState(inputs({ riding: "bike", onLadder: true, onRope: true })).baseState).toBe("bike");
    expect(resolvePlayerVisualState(inputs({ onLadder: true, onRope: true, status: { tiny: true } })).baseState).toBe("ladder");
    expect(resolvePlayerVisualState(inputs({ onRope: true, status: { tiny: true } })).baseState).toBe("rope");
  });

  it("forced event state wins over everything", () => {
    const r = resolvePlayerVisualState(inputs({ event: "robot", ko: true, riding: "bike" }));
    expect(r.baseState).toBe("robot");
  });

  it("ladder/rope/sitting/sleeping lock the animation; default/bike do not", () => {
    expect(resolvePlayerVisualState(inputs({ onLadder: true })).lockAnimation).toBe(true);
    expect(resolvePlayerVisualState(inputs({ event: "sitting" })).lockAnimation).toBe(true);
    expect(resolvePlayerVisualState(inputs({ riding: "bike" })).lockAnimation).toBe(false);
  });

  it("water clip only when upright (default/tiny), not on ladder/bike/dead", () => {
    expect(resolvePlayerVisualState(inputs({ deepWater: true })).transforms.waterClip).toBe(true);
    expect(resolvePlayerVisualState(inputs({ deepWater: true, status: { tiny: true } })).transforms.waterClip).toBe(true);
    expect(resolvePlayerVisualState(inputs({ deepWater: true, onLadder: true })).transforms.waterClip).toBe(false);
    expect(resolvePlayerVisualState(inputs({ deepWater: true, riding: "bike" })).transforms.waterClip).toBe(false);
    expect(resolvePlayerVisualState(inputs({ deepWater: true, ko: true })).transforms.waterClip).toBe(false);
  });

  it("invert palette is independent of base state", () => {
    expect(resolvePlayerVisualState(inputs({ invertPalette: true })).transforms.invertPalette).toBe(true);
    expect(resolvePlayerVisualState(inputs({ invertPalette: true, riding: "bike" })).transforms.invertPalette).toBe(true);
  });

  it("teleport spin is active when teleporting and alive, suppressed when KO'd", () => {
    expect(resolvePlayerVisualState(inputs({ teleporting: true })).transforms.teleportSpin).toBe(true);
    expect(resolvePlayerVisualState(inputs({ teleporting: true, ko: true })).transforms.teleportSpin).toBe(false);
  });

  it("overlays layer on living heroes and stack; suppressed when KO'd", () => {
    const r = resolvePlayerVisualState(inputs({ status: { mushroomized: true, possessed: true, sweating: true } }));
    expect(r.overlays.sort()).toEqual(["mushroom", "possessionGhost", "sweat"].sort());
    const dead = resolvePlayerVisualState(inputs({ ko: true, status: { mushroomized: true, sweating: true } }));
    expect(dead.overlays).toEqual([]);
  });

  it("overlays coexist with a non-default base (e.g. mushroom while tiny)", () => {
    const r = resolvePlayerVisualState(inputs({ status: { tiny: true, mushroomized: true } }));
    expect(r.baseState).toBe("tiny");
    expect(r.overlays).toEqual(["mushroom"]);
  });
});
