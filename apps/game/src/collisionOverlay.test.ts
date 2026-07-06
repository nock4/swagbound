import { describe, expect, it } from "vitest";
import {
  SURFACE_SOLID_MASK,
  solidAtWorldPixel,
  surfaceAtWorldPixel
} from "./collisionOverlay";

describe("collision overlay queries", () => {
  it("treats out-of-bounds world pixels as solid", () => {
    const grid = { cellSize: 8, width: 2, height: 2 };
    const solidRows = ["00", "01"];

    expect(solidAtWorldPixel(solidRows, { x: 0, y: 0 }, grid)).toBe(false);
    expect(solidAtWorldPixel(solidRows, { x: 8, y: 8 }, grid)).toBe(true);
    expect(solidAtWorldPixel(solidRows, { x: -1, y: 0 }, grid)).toBe(true);
    expect(solidAtWorldPixel(solidRows, { x: 16, y: 0 }, grid)).toBe(true);
    expect(solidAtWorldPixel(solidRows, { x: 0, y: 16 }, grid)).toBe(true);
  });

  it("reports out-of-bounds surface probes as solid surface", () => {
    const grid = { cellSize: 8, width: 1, height: 1 };

    expect(surfaceAtWorldPixel(["00"], { x: 0, y: 0 }, grid)).toBe(0);
    expect(surfaceAtWorldPixel(["00"], { x: -1, y: 0 }, grid)).toBe(SURFACE_SOLID_MASK);
    expect(surfaceAtWorldPixel(["00"], { x: 8, y: 0 }, grid)).toBe(SURFACE_SOLID_MASK);
  });
});
