/**
 * Collision Override Paint Editor — a dev-only tool for authoring solid-collision
 * override rects on the live map. Activated with `?collisionedit=1` (forces the
 * collision overlay on so you can see what you paint).
 *
 * Workflow (see the on-screen panel for the legend):
 *   arrows/WASD  walk the player normally (camera follows the player)
 *   I/J/K/L      move the paint cursor one 8px cell (up/left/down/right)
 *   H            snap the cursor to the player's cell
 *   P            paint the cursor cell solid
 *   R            rect mode: first press anchors a corner at the cursor, second
 *                press paints the whole anchor→cursor rectangle
 *   U            undo the last painted rect/cell (this session)
 *   E            export → downloads a merged collision-overrides.json
 *                (authored rects + this session's, notes auto-stamped)
 *
 * Painted rects apply to the live collision grid instantly (same shared
 * applySolidOverrideRects the scene uses at boot), so you can immediately walk
 * against them to test. Promote the export by replacing
 * content/collision-overrides.json and reviewing the git diff.
 */
import type { CollisionOverrideRect } from "./collisionOverrides";

export type EditorCell = { cellX: number; cellY: number };

export interface CollisionEditorHost {
  getPlayerPosition(): { x: number; y: number };
  cellSize(): number;
  gridSize(): { width: number; height: number };
  /** The authored rects loaded from content (for the export merge). */
  authoredRects(): CollisionOverrideRect[];
  /** Re-apply: base grid + authored + the given session rects, then repaint the overlay. */
  applySessionRects(rects: readonly CollisionOverrideRect[]): void;
}

/** Read the `?collisionedit=1` flag from a location search string. */
export function isCollisionEditEnabled(search: string | undefined): boolean {
  const raw = new URLSearchParams(search ?? "").get("collisionedit");
  if (raw === null) {
    return false;
  }
  const value = raw.trim().toLowerCase();
  return value === "" || value === "1" || value === "true" || value === "yes" || value === "on";
}

type SessionRect = CollisionOverrideRect & { note: string };

export class CollisionOverrideEditor {
  /**
   * The one live editor. The world scene can restart (boot/save-load races)
   * before its shutdown hook runs, which would leave orphaned instances with
   * live key handlers — every keypress would then fire once per orphan. A new
   * editor therefore destroys its predecessor, and keys are handled by a
   * window listener the editor owns (not Phaser scene bindings, which belong
   * to the possibly-stale scene instance).
   */
  private static current: CollisionOverrideEditor | undefined;

  private cursorCell: EditorCell;
  private anchor: EditorCell | undefined;
  private session: SessionRect[] = [];
  private lastStatus = "";
  private panel: HTMLElement | undefined;
  private readonly keyHandler = (event: KeyboardEvent): void => {
    switch (event.code) {
      case "KeyI": this.moveCursor(0, -1); break;
      case "KeyK": this.moveCursor(0, 1); break;
      case "KeyJ": this.moveCursor(-1, 0); break;
      case "KeyL": this.moveCursor(1, 0); break;
      case "KeyH": if (!event.repeat) this.snapCursorToPlayer(); break;
      case "KeyP": if (!event.repeat) this.paintCell(); break;
      case "KeyR": if (!event.repeat) this.rectCorner(); break;
      case "KeyU": if (!event.repeat) this.undo(); break;
      case "KeyE": if (!event.repeat) this.exportOverrides(); break;
      default: return;
    }
  };

  constructor(private readonly host: CollisionEditorHost) {
    CollisionOverrideEditor.current?.destroy();
    CollisionOverrideEditor.current = this;
    const player = host.getPlayerPosition();
    const cs = host.cellSize();
    this.cursorCell = { cellX: Math.floor(player.x / cs), cellY: Math.floor(player.y / cs) };
    this.mountPanel();
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler);
    }
    this.render();
  }

  /** Current cursor cell, for the scene's overlay highlight. */
  cursor(): EditorCell {
    return this.cursorCell;
  }

  /** Pending rect-anchor cell, if R was pressed once. */
  rectAnchor(): EditorCell | undefined {
    return this.anchor;
  }

  moveCursor(dx: number, dy: number): void {
    const { width, height } = this.host.gridSize();
    this.cursorCell = {
      cellX: Math.min(Math.max(this.cursorCell.cellX + dx, 0), width - 1),
      cellY: Math.min(Math.max(this.cursorCell.cellY + dy, 0), height - 1)
    };
    this.render();
  }

  snapCursorToPlayer(): void {
    const player = this.host.getPlayerPosition();
    const cs = this.host.cellSize();
    this.cursorCell = { cellX: Math.floor(player.x / cs), cellY: Math.floor(player.y / cs) };
    this.setStatus("cursor → player");
    this.render();
  }

  paintCell(): void {
    const cs = this.host.cellSize();
    this.setStatus(`painted cell (${this.cursorCell.cellX},${this.cursorCell.cellY})`);
    this.pushRect({
      x: this.cursorCell.cellX * cs,
      y: this.cursorCell.cellY * cs,
      w: cs,
      h: cs,
      note: this.stampNote()
    });
  }

  /** First press anchors, second press paints the anchor→cursor rectangle. */
  rectCorner(): void {
    if (!this.anchor) {
      this.anchor = { ...this.cursorCell };
      this.setStatus(`rect anchor set (${this.anchor.cellX},${this.anchor.cellY}) — move + R to paint`);
      this.render();
      return;
    }
    const cs = this.host.cellSize();
    const cx0 = Math.min(this.anchor.cellX, this.cursorCell.cellX);
    const cx1 = Math.max(this.anchor.cellX, this.cursorCell.cellX);
    const cy0 = Math.min(this.anchor.cellY, this.cursorCell.cellY);
    const cy1 = Math.max(this.anchor.cellY, this.cursorCell.cellY);
    this.anchor = undefined;
    this.setStatus(`painted rect ${cx1 - cx0 + 1}x${cy1 - cy0 + 1} cells`);
    this.pushRect({
      x: cx0 * cs,
      y: cy0 * cs,
      w: (cx1 - cx0 + 1) * cs,
      h: (cy1 - cy0 + 1) * cs,
      note: this.stampNote()
    });
  }

  undo(): void {
    if (this.session.length === 0) {
      this.setStatus("nothing to undo");
      this.render();
      return;
    }
    this.session.pop();
    this.host.applySessionRects(this.session);
    this.setStatus(`undo — ${this.session.length} session rect(s) left`);
    this.render();
  }

  /** Download authored + session rects as a merged collision-overrides.json. */
  exportOverrides(): void {
    const merged = {
      schema: "swagbound.collision-overrides.v1",
      solids: [...this.host.authoredRects(), ...this.session]
    };
    const json = JSON.stringify(merged, null, 2);
    (globalThis as Record<string, unknown>).__collisionOverridesExport = merged;
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.log("[collisionedit] merged overrides:\n" + json);
    }
    this.downloadJson(json);
    this.setStatus(`exported ${merged.solids.length} rects (${this.session.length} new)`);
    this.render();
  }

  /** Called every frame by the scene. */
  refresh(): void {
    this.render();
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyHandler);
    }
    this.panel?.remove();
    this.panel = undefined;
    if (CollisionOverrideEditor.current === this) {
      CollisionOverrideEditor.current = undefined;
    }
  }

  // --- internals -------------------------------------------------------------

  private pushRect(rect: SessionRect): void {
    this.session.push(rect);
    this.host.applySessionRects(this.session);
    this.render();
  }

  private stampNote(): string {
    const day = new Date().toISOString().slice(0, 10);
    return `painted ${day}`;
  }

  private setStatus(message: string): void {
    this.lastStatus = message;
  }

  private downloadJson(json: string): void {
    if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
      return;
    }
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "collision-overrides.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Non-fatal: console log + window.__collisionOverridesExport are the fallback.
    }
  }

  private mountPanel(): void {
    if (typeof document === "undefined") {
      return;
    }
    const panel = document.createElement("div");
    panel.id = "collision-override-editor";
    Object.assign(panel.style, {
      position: "fixed",
      top: "8px",
      left: "8px",
      zIndex: "99999",
      font: "11px/1.45 ui-monospace, Menlo, Consolas, monospace",
      color: "#e8e8e8",
      background: "rgba(12,12,18,0.86)",
      border: "1px solid #fc6",
      borderRadius: "6px",
      padding: "8px 10px",
      maxWidth: "340px",
      pointerEvents: "none",
      whiteSpace: "pre",
      textShadow: "0 1px 0 #000"
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(panel);
    this.panel = panel;
  }

  private render(): void {
    if (!this.panel) {
      return;
    }
    const player = this.host.getPlayerPosition();
    const cs = this.host.cellSize();
    const cursorPx = { x: this.cursorCell.cellX * cs, y: this.cursorCell.cellY * cs };
    const legend =
      "IJKL move cursor   H cursor→player\n" +
      "P paint cell       R rect corner (x2)\n" +
      "U undo             E export json";
    this.panel.textContent =
      "COLLISION PAINT EDITOR  (?collisionedit)\n" +
      `player @ (${Math.round(player.x)}, ${Math.round(player.y)})\n` +
      `cursor @ cell (${this.cursorCell.cellX},${this.cursorCell.cellY}) px (${cursorPx.x},${cursorPx.y})` +
      (this.anchor ? `   anchor (${this.anchor.cellX},${this.anchor.cellY})` : "") +
      "\n" +
      `session rects: ${this.session.length}\n` +
      "────────────────────────────────\n" +
      legend +
      (this.lastStatus ? `\n» ${this.lastStatus}` : "");
  }
}
