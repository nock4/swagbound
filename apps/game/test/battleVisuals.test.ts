import { describe, expect, it } from "vitest";
import {
  ENEMY_DEFEAT_FADE_MS,
  ENEMY_TARGET_CURSOR_GAP_PX,
  ENEMY_TARGET_CURSOR_TOP_FRACTION,
  MENU_CURSOR_BLINK_PERIOD_MS,
  enemyDefeatVisualState,
  enemyShadowEllipse,
  enemyTargetCursorAnchorY,
  menuCursorVisible,
  menuRowTexts,
  selectionArrowTriangle
} from "../src/battleVisuals";

describe("battleVisuals", () => {
  describe("enemyShadowEllipse", () => {
    it("centers under the sprite and sits below its center", () => {
      const shadow = enemyShadowEllipse(100, 80, 64, 96);
      expect(shadow.x).toBe(100);
      expect(shadow.y).toBeGreaterThan(80);
      expect(shadow.radiusY).toBeLessThan(shadow.radiusX);
    });

    it("scales the ellipse width with the sprite display width", () => {
      const small = enemyShadowEllipse(0, 0, 40, 40);
      const big = enemyShadowEllipse(0, 0, 120, 40);
      expect(big.radiusX).toBeGreaterThan(small.radiusX);
    });

    it("clamps degenerate sizes to a minimum and tolerates non-finite input", () => {
      const shadow = enemyShadowEllipse(Number.NaN, Number.NaN, 0, 0);
      expect(shadow.x).toBe(0);
      expect(shadow.radiusX).toBeGreaterThanOrEqual(1);
      expect(shadow.radiusY).toBeGreaterThanOrEqual(1);
    });
  });

  describe("enemyTargetCursorAnchorY", () => {
    it("anchors near the visible sprite top instead of the padded bounding-box top", () => {
      const centerY = 100;
      const displayHeight = 160;
      const anchored = enemyTargetCursorAnchorY(centerY, displayHeight);

      expect(anchored).toBe(centerY - displayHeight * ENEMY_TARGET_CURSOR_TOP_FRACTION - ENEMY_TARGET_CURSOR_GAP_PX);
      expect(anchored).toBeGreaterThan(centerY - displayHeight / 2 - 16);
    });

    it("tolerates degenerate sprite heights", () => {
      expect(enemyTargetCursorAnchorY(Number.NaN, 0)).toBe(-ENEMY_TARGET_CURSOR_TOP_FRACTION - ENEMY_TARGET_CURSOR_GAP_PX);
    });
  });

  describe("menuCursorVisible", () => {
    it("toggles visibility at the EB-style cursor blink cadence", () => {
      expect(menuCursorVisible(0)).toBe(true);
      expect(menuCursorVisible(MENU_CURSOR_BLINK_PERIOD_MS / 2 - 1)).toBe(true);
      expect(menuCursorVisible(MENU_CURSOR_BLINK_PERIOD_MS / 2)).toBe(false);
      expect(menuCursorVisible(MENU_CURSOR_BLINK_PERIOD_MS - 1)).toBe(false);
      expect(menuCursorVisible(MENU_CURSOR_BLINK_PERIOD_MS)).toBe(true);
    });
  });

  describe("menuRowTexts", () => {
    it("keeps selection state out of row text", () => {
      const rows = menuRowTexts([
        { label: "BASH", selected: true },
        { label: "PSI", selected: false },
        { label: "OK", selected: true }
      ]);

      expect(rows).toEqual(["BASH", "PSI", "OK"]);
      expect(rows.join("\n")).not.toContain(">");
    });
  });

  describe("selectionArrowTriangle", () => {
    it("builds a right-pointing triangle in the cursor gutter", () => {
      expect(selectionArrowTriangle(17, 20, 18)).toEqual({
        x1: 17,
        y1: 24,
        x2: 17,
        y2: 34,
        x3: 26,
        y3: 29
      });
    });
  });

  describe("enemyDefeatVisualState", () => {
    it("moves from alive to dying to hidden without changing combat state", () => {
      expect(enemyDefeatVisualState(1_000, true, null)).toMatchObject({
        phase: "alive",
        visible: true,
        alpha: 1
      });

      const dying = enemyDefeatVisualState(1_000 + ENEMY_DEFEAT_FADE_MS / 2, false, 1_000);
      expect(dying.phase).toBe("dying");
      expect(dying.visible).toBe(true);
      expect(dying.alpha).toBeCloseTo(0.5);

      expect(enemyDefeatVisualState(1_000 + ENEMY_DEFEAT_FADE_MS, false, 1_000)).toMatchObject({
        phase: "hidden",
        visible: false,
        alpha: 0
      });
    });
  });
});
