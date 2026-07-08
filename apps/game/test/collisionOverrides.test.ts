import { describe, expect, it } from "vitest";
import { applyClearOverrideRects, applySolidOverrideRects } from "../src/collisionOverrides";

describe("applySolidOverrideRects", () => {
  it("marks covered cells solid at 8px cell granularity", () => {
    const rows = ["0000", "0000", "0000"];
    applySolidOverrideRects(rows, [{ x: 8, y: 8, w: 16, h: 8 }], 8);
    expect(rows).toEqual(["0000", "0110", "0000"]);
  });

  it("clamps rects that spill past the grid", () => {
    const rows = ["00", "00"];
    applySolidOverrideRects(rows, [{ x: -8, y: 8, w: 64, h: 64 }], 8);
    expect(rows).toEqual(["00", "11"]);
  });

  it("no-ops on empty inputs", () => {
    const rows = ["00"];
    applySolidOverrideRects(rows, [], 8);
    expect(rows).toEqual(["00"]);
  });

  it("treats rect edges exclusively at cell boundaries (w/h measured in px)", () => {
    // an 8px rect exactly on one cell touches only that cell
    const rows = ["000", "000"];
    applySolidOverrideRects(rows, [{ x: 8, y: 0, w: 8, h: 8 }], 8);
    expect(rows).toEqual(["010", "000"]);
  });

  it("can clear authored cells before solid overrides are applied", () => {
    const rows = ["111", "111"];
    applyClearOverrideRects(rows, [{ x: 8, y: 0, w: 8, h: 8 }], 8);
    expect(rows).toEqual(["101", "111"]);
  });
});
