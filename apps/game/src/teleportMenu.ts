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
        padding: "14px 18px",
        minWidth: "220px",
        pointerEvents: "none",
        textShadow: "0 1px 0 #000"
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(panel);
      this.panel = panel;
    }
    const rows = towns.map((town, i) => {
      const cursor = i === this.cursor ? "▸" : "  ";
      return `${cursor} ${town.name}`;
    });
    this.panel.textContent =
      "✨ PSI Teleport β\n" +
      "──────────────────\n" +
      (rows.length > 0 ? rows.join("\n") : "(nowhere to go yet)") +
      "\n──────────────────\n" +
      "↑↓ pick   Z go   X close";
  }
}
