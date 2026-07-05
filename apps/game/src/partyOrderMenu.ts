/**
 * Party order / swap screen. Press K in the overworld to reorder the active party:
 * the top member leads the overworld march and takes the first battle command slot.
 * Up/Down move the cursor; Z grabs a member (Up/Down then slides them, live); Z drops;
 * X closes. A DOM overlay driven by a window key listener (singleton — a scene restart
 * can't strand a second live menu), matching the teleport/journal menus.
 *
 * With a full four-hero roster there is no bench (battle already caps at four), so this
 * is a pure order swap: who leads, who acts first.
 */
export type PartyOrderMember = { id: number; name: string };

export interface PartyOrderMenuHost {
  /** Active party in current order (index 0 = lead). */
  members(): PartyOrderMember[];
  /** Commit a new order (array of charIds). Called live as the player slides a member. */
  reorder(ids: number[]): void;
  /** True when the overworld is accepting a menu open (not in dialogue/battle/menu). */
  canOpen(): boolean;
}

export function isPartyOrderKey(code: string): boolean {
  return code === "KeyK";
}

export class PartyOrderMenu {
  private static current: PartyOrderMenu | undefined;
  private open = false;
  private cursor = 0;
  private grabbed = false;
  private panel: HTMLElement | undefined;
  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (!this.open) {
      if (isPartyOrderKey(event.code) && this.host.canOpen()) {
        this.openMenu();
        event.preventDefault();
      }
      return;
    }
    switch (event.code) {
      case "ArrowUp": case "KeyW": this.move(-1); break;
      case "ArrowDown": case "KeyS": this.move(1); break;
      case "KeyZ": case "Enter": case "Space": this.toggleGrab(); break;
      case "KeyX": case "Escape": case "KeyK": this.close(); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  constructor(private readonly host: PartyOrderMenuHost) {
    PartyOrderMenu.current?.destroy();
    PartyOrderMenu.current = this;
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler, true);
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Open programmatically (e.g. from the command-menu Party tile). Caller owns the gating. */
  openOverlay(): void {
    if (!this.open) {
      this.openMenu();
    }
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyHandler, true);
    }
    this.panel?.remove();
    this.panel = undefined;
    if (PartyOrderMenu.current === this) {
      PartyOrderMenu.current = undefined;
    }
  }

  // --- internals -------------------------------------------------------------

  private openMenu(): void {
    this.open = true;
    this.cursor = 0;
    this.grabbed = false;
    this.render();
  }

  private close(): void {
    this.open = false;
    this.grabbed = false;
    this.panel?.remove();
    this.panel = undefined;
  }

  private move(delta: number): void {
    const members = this.host.members();
    if (members.length === 0) {
      return;
    }
    const next = Math.min(members.length - 1, Math.max(0, this.cursor + delta));
    if (this.grabbed && next !== this.cursor) {
      // Slide the grabbed member to its new slot and commit live.
      const ids = members.map((m) => m.id);
      const [moved] = ids.splice(this.cursor, 1);
      ids.splice(next, 0, moved);
      this.host.reorder(ids);
    }
    this.cursor = next;
    this.render();
  }

  private toggleGrab(): void {
    if (this.host.members().length <= 1) {
      return;
    }
    this.grabbed = !this.grabbed;
    this.render();
  }

  private render(): void {
    if (typeof document === "undefined") {
      return;
    }
    if (!this.panel) {
      const panel = document.createElement("div");
      Object.assign(panel.style, {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: "99999",
        font: "13px/1.6 ui-monospace, Menlo, Consolas, monospace",
        color: "#f4f4f4",
        background: "rgba(14,14,22,0.96)",
        border: "2px solid #ffb454",
        borderRadius: "8px",
        padding: "12px 16px",
        minWidth: "220px",
        pointerEvents: "none",
        textShadow: "0 1px 0 #000"
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(panel);
      this.panel = panel;
    }
    const members = this.host.members();
    const rows = members
      .map((member, index) => {
        const isCursor = index === this.cursor;
        const grabbed = isCursor && this.grabbed;
        const lead = index === 0 ? " ◄ lead" : "";
        const marker = grabbed ? "✥" : isCursor ? "▸" : " ";
        const color = grabbed ? "#ffd23f" : isCursor ? "#ffe8b0" : "#d8d4e0";
        const weight = grabbed ? "font-weight:bold;" : "";
        return `<div style="color:${color};${weight}padding:1px 0;">${marker} ${index + 1}. ${member.name}<span style="color:#8a86a0;">${lead}</span></div>`;
      })
      .join("");
    const hint = this.grabbed ? "↑↓ slide&nbsp;&nbsp;Z drop" : "↑↓ pick&nbsp;&nbsp;Z grab&nbsp;&nbsp;X close";
    this.panel.innerHTML =
      `<div style="font-size:13px;margin-bottom:6px;">🎭 Party Order</div>` +
      (rows || `<div style="color:#8a86a0;">(no party)</div>`) +
      `<div style="font-size:11px;margin-top:6px;color:#9a94b8;">${hint}</div>`;
  }
}
