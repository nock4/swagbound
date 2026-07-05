/**
 * PSI Teleport fast-travel menu. Press T in the overworld to open a picker of
 * towns you've visited; choose one and Bosch does the EarthBound run-up spin,
 * then arrives. Only reachable places you've already been show up — you can't
 * teleport somewhere you've never seen.
 *
 * Keys: up/down (or W/S) move the cursor, Z/Enter teleport, X/Esc close.
 * Rendered as a DOM overlay and driven by a window key listener (a singleton, so
 * a scene restart can't strand a second live menu) — the same robustness pattern
 * as the collision editor.
 */
export type TeleportTown = { id: string; name: string; x: number; y: number };

export interface TeleportMenuHost {
  /** Towns the player has visited, in display order. */
  visitedTowns(): TeleportTown[];
  /** Run the teleport: spin animation, then arrive at the town. */
  teleportTo(town: TeleportTown): void;
  /** True when the overworld is accepting a menu open (not in dialogue/battle/menu). */
  canOpen(): boolean;
  /** Every registered town (visited or not) for laying out the map. */
  allTowns(): TeleportTown[];
  /** Player's current world position, for the "you are here" marker. */
  playerWorldPos(): { x: number; y: number };
}

export function isTeleportKey(code: string): boolean {
  return code === "KeyT";
}

export class TeleportMenu {
  private static current: TeleportMenu | undefined;
  private open = false;
  private cursor = 0;
  private panel: HTMLElement | undefined;
  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (!this.open) {
      if (isTeleportKey(event.code) && this.host.canOpen()) {
        this.openMenu();
        event.preventDefault();
      }
      return;
    }
    switch (event.code) {
      case "ArrowUp": case "KeyW": this.move(-1); break;
      case "ArrowDown": case "KeyS": this.move(1); break;
      case "KeyZ": case "Enter": case "Space": this.confirm(); break;
      case "KeyX": case "Escape": this.close(); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  constructor(private readonly host: TeleportMenuHost) {
    TeleportMenu.current?.destroy();
    TeleportMenu.current = this;
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler, true);
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyHandler, true);
    }
    this.panel?.remove();
    this.panel = undefined;
    if (TeleportMenu.current === this) {
      TeleportMenu.current = undefined;
    }
  }

  // --- internals -------------------------------------------------------------

  private openMenu(): void {
    this.open = true;
    this.cursor = 0;
    this.render();
  }

  private close(): void {
    this.open = false;
    this.panel?.remove();
    this.panel = undefined;
  }

  private move(delta: number): void {
    const towns = this.host.visitedTowns();
    if (towns.length === 0) {
      return;
    }
    this.cursor = (this.cursor + delta + towns.length) % towns.length;
    this.render();
  }

  private confirm(): void {
    const towns = this.host.visitedTowns();
    const town = towns[this.cursor];
    this.close();
    if (town) {
      this.host.teleportTo(town);
    }
  }

  private render(): void {
    const towns = this.host.visitedTowns();
    if (!this.panel) {
      if (typeof document === "undefined") {
        return;
      }
      const panel = document.createElement("div");
      Object.assign(panel.style, {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: "99999",
        font: "13px/1.6 ui-monospace, Menlo, Consolas, monospace",
        color: "#f4f4f4",
        background: "rgba(14,14,22,0.95)",
        border: "2px solid #9a8cff",
        borderRadius: "8px",
        padding: "12px 14px",
        pointerEvents: "none",
        textShadow: "0 1px 0 #000"
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(panel);
      this.panel = panel;
    }
    const selected = towns[this.cursor];
    this.panel.innerHTML =
      `<div style="font-size:13px;margin-bottom:6px;">🗺️ Town Map &nbsp;·&nbsp; PSI Teleport</div>` +
      this.mapSvg(selected) +
      `<div style="font-size:12px;margin-top:6px;color:#cfc9ff;">` +
      (selected ? `▸ ${selected.name}` : "(no town visited yet)") +
      `</div>` +
      `<div style="font-size:11px;margin-top:2px;color:#9a94c8;">↑↓ pick&nbsp;&nbsp;Z go&nbsp;&nbsp;X close</div>`;
  }

  /** Schematic map: every town positioned by world coords; visited ones are bright + reachable. */
  private mapSvg(selected: TeleportTown | undefined): string {
    const all = this.host.allTowns();
    const player = this.host.playerWorldPos();
    const visitedIds = new Set(this.host.visitedTowns().map((t) => t.id));
    const xs = [...all.map((t) => t.x), player.x];
    const ys = [...all.map((t) => t.y), player.y];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const W = 240;
    const H = 180;
    const pad = 22;
    const nx = (x: number) => pad + ((x - minX) / Math.max(1, maxX - minX)) * (W - 2 * pad);
    const ny = (y: number) => pad + ((y - minY) / Math.max(1, maxY - minY)) * (H - 2 * pad);
    const dots = all
      .map((t) => {
        const visited = visitedIds.has(t.id);
        const isSel = selected?.id === t.id;
        const cx = nx(t.x).toFixed(1);
        const cy = ny(t.y).toFixed(1);
        const fill = visited ? (isSel ? "#ffd23f" : "#9a8cff") : "#4a4664";
        const label = visited ? t.name : "???";
        const r = isSel ? 5 : 3.5;
        const ring = isSel ? `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="#ffd23f" stroke-width="1.5"/>` : "";
        return `${ring}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>` +
          `<text x="${cx}" y="${(ny(t.y) - 8).toFixed(1)}" fill="${visited ? "#eee" : "#777"}" font-size="9" text-anchor="middle" font-family="ui-monospace,monospace">${label}</text>`;
      })
      .join("");
    const px = nx(player.x).toFixed(1);
    const py = ny(player.y).toFixed(1);
    const you = `<circle cx="${px}" cy="${py}" r="4" fill="#4dd07f"/><circle cx="${px}" cy="${py}" r="8" fill="none" stroke="#4dd07f" stroke-width="1"/>`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:rgba(0,0,0,0.35);border-radius:6px;">${dots}${you}</svg>`;
  }
}
