/**
 * Boss Placement Editor — a dev-only visual tool for manually positioning the
 * story boss gates on the live map. Activated with `?bossedit=1`.
 *
 * Workflow (see the on-screen panel for the legend):
 *   [ / ]  select prev / next boss  (also teleports you to it so it's on screen)
 *   J      jump (teleport) to the selected boss
 *   arrows/WASD  walk the player normally
 *   G      "grab" — move the selected boss to where you're standing
 *   F      cycle the selected boss's facing
 *   E      export placements → downloads boss-placements.json + logs + window.__bossPlacements
 *
 * The editor never triggers boss battles: the scene disarms all gates while an
 * editor instance is active, so you can walk through bosses freely.
 */

export type BossFacing = "down" | "up" | "left" | "right";

export interface BossEditorEntry {
  triggerId: string;
  enemyGroup: number;
  enemyName?: string;
  x: number;
  y: number;
  facing: BossFacing;
}

export interface BossEditorHost {
  /** All currently-spawned boss gate actors (live coords). */
  listBosses(): BossEditorEntry[];
  /** Move a boss actor to a world-pixel position (updates the live sprite). */
  moveBoss(triggerId: string, x: number, y: number): void;
  /** Set a boss actor's facing (updates the live sprite frame). */
  setBossFacing(triggerId: string, facing: BossFacing): void;
  /** The player's current world-pixel position. */
  getPlayerPosition(): { x: number; y: number };
  /** Teleport the player to a world-pixel position (camera + chunks follow). */
  warpPlayerTo(x: number, y: number): void;
}

const FACING_ORDER: readonly BossFacing[] = ["down", "left", "up", "right"] as const;

/** Read the `?bossedit=1` flag from a location search string. */
export function isBossEditEnabled(search: string | undefined): boolean {
  const raw = new URLSearchParams(search ?? "").get("bossedit");
  if (raw === null) {
    return false;
  }
  const value = raw.trim().toLowerCase();
  return value === "" || value === "1" || value === "true" || value === "yes" || value === "on";
}

export class BossPlacementEditor {
  private selected = 0;
  private initialized = false;
  private lastStatus = "";
  private panel: HTMLElement | undefined;

  constructor(private readonly host: BossEditorHost) {
    this.mountPanel();
  }

  /** True whenever the editor is live (used by the scene to disarm gates). */
  isActive(): boolean {
    return true;
  }

  /** Called every frame: lazily jumps to the first boss, then repaints the panel. */
  refresh(): void {
    const bosses = this.host.listBosses();
    if (!this.initialized && bosses.length > 0) {
      this.initialized = true;
      this.selected = 0;
      this.jumpToSelected(bosses);
      this.setStatus(`ready — ${bosses.length} boss gates loaded`);
    }
    this.render(bosses);
  }

  selectNext(): void {
    const bosses = this.host.listBosses();
    if (bosses.length === 0) {
      return;
    }
    this.selected = (this.selected + 1) % bosses.length;
    this.jumpToSelected(bosses);
    this.setStatus(`selected ${bosses[this.selected]?.triggerId}`);
    this.render(bosses);
  }

  selectPrev(): void {
    const bosses = this.host.listBosses();
    if (bosses.length === 0) {
      return;
    }
    this.selected = (this.selected - 1 + bosses.length) % bosses.length;
    this.jumpToSelected(bosses);
    this.setStatus(`selected ${bosses[this.selected]?.triggerId}`);
    this.render(bosses);
  }

  /** Teleport the player next to the selected boss so it is on screen. */
  jumpToSelected(list?: BossEditorEntry[]): void {
    const bosses = list ?? this.host.listBosses();
    const boss = bosses[this.selected];
    if (!boss) {
      return;
    }
    // Land two cells below the boss so it is visible rather than under the player.
    this.host.warpPlayerTo(boss.x, boss.y + 16);
  }

  /** Move the selected boss to the player's current standing position. */
  placeSelectedAtPlayer(): void {
    const bosses = this.host.listBosses();
    const boss = bosses[this.selected];
    if (!boss) {
      return;
    }
    const { x, y } = this.host.getPlayerPosition();
    this.host.moveBoss(boss.triggerId, x, y);
    this.setStatus(`placed ${boss.triggerId} at (${x}, ${y})`);
    this.render(this.host.listBosses());
  }

  cycleFacing(): void {
    const bosses = this.host.listBosses();
    const boss = bosses[this.selected];
    if (!boss) {
      return;
    }
    const next = FACING_ORDER[(FACING_ORDER.indexOf(boss.facing) + 1) % FACING_ORDER.length] ?? "down";
    this.host.setBossFacing(boss.triggerId, next);
    this.setStatus(`${boss.triggerId} facing → ${next}`);
    this.render(this.host.listBosses());
  }

  /** Export the current placements as JSON (download + console + window global). */
  exportPlacements(): void {
    const bosses = this.host.listBosses();
    const payload = {
      schema: "swagbound.boss-placements.v1",
      bosses: bosses.map((b) => ({
        triggerId: b.triggerId,
        battleGroup: b.enemyGroup,
        x: b.x,
        y: b.y,
        facing: b.facing
      }))
    };
    const json = JSON.stringify(payload, null, 2);
    (globalThis as Record<string, unknown>).__bossPlacements = payload;
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.log("[bossedit] placements:\n" + json);
    }
    this.downloadJson(json);
    this.setStatus(`exported ${bosses.length} placements (see console + download)`);
    this.render(bosses);
  }

  destroy(): void {
    this.panel?.remove();
    this.panel = undefined;
  }

  // --- internals -------------------------------------------------------------

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
      link.download = "boss-placements.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Non-fatal: the console log + window.__bossPlacements are the fallback.
    }
  }

  private mountPanel(): void {
    if (typeof document === "undefined") {
      return;
    }
    const panel = document.createElement("div");
    panel.id = "boss-placement-editor";
    Object.assign(panel.style, {
      position: "fixed",
      top: "8px",
      left: "8px",
      zIndex: "99999",
      font: "11px/1.45 ui-monospace, Menlo, Consolas, monospace",
      color: "#e8e8e8",
      background: "rgba(12,12,18,0.86)",
      border: "1px solid #6cf",
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

  private render(bosses: BossEditorEntry[]): void {
    if (!this.panel) {
      return;
    }
    const player = this.host.getPlayerPosition();
    const rows = bosses.map((b, i) => {
      const cursor = i === this.selected ? "▸" : " ";
      const name = b.enemyName ? ` ${b.enemyName}` : "";
      const label = `${b.triggerId}${name}`.padEnd(30).slice(0, 30);
      return `${cursor} ${String(i + 1).padStart(2)} ${label} (${b.x},${b.y}) ${b.facing}`;
    });
    const legend =
      "[ ] select   J jump   G place-at-me\n" +
      "F facing     E export";
    this.panel.textContent =
      "BOSS PLACEMENT EDITOR  (?bossedit)\n" +
      `player @ (${player.x}, ${player.y})\n` +
      "────────────────────────────────\n" +
      (rows.length > 0 ? rows.join("\n") : "(waiting for boss gates to spawn…)") +
      "\n────────────────────────────────\n" +
      legend +
      (this.lastStatus ? `\n» ${this.lastStatus}` : "");
  }
}
