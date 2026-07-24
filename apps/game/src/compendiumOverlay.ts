/**
 * The Demonic Compendium explorer (Mons Ranch). A full-screen EarthBound
 * clean-window overlay to browse every Mon ever owned, filter by race, read
 * stats/moves/lineage, and re-summon a registered Mon for Swag Coins.
 *
 * Keys: C opens (on ranch land), arrows move, Q/E cycle the race filter,
 * Z re-summon the selected Mon, X/Esc close.
 */
import {
  CLEAN_UI_FONT_FAMILY,
  CLEAN_UI_PRIMARY,
  CLEAN_UI_SECONDARY,
  CLEAN_UI_SELECTION_TEXT
} from "./cleanUi";

export type CompendiumRow = {
  registryId: string;
  name: string;
  race: string;
  element: string;
  level: number;
  moves: string[];
  timesOwned: number;
  cost: number;
  lineage?: string;
  spriteUrl?: string;
  owned: boolean;
};

export type CompendiumOverlayHost = {
  canOpen(): boolean;
  rows(): CompendiumRow[];
  swagCoins(): number;
  resummon(registryId: string): { ok: boolean; reason?: string };
  onClose(): void;
};

const EB_FILL = "#101010";
const EB_BORDER = "#ffffff";
const EB_BEVEL = "#585868";
const EB_COIN = "#e6bd54";
const RACE_ALL = "All";

function isCompendiumKey(code: string): boolean {
  return code === "KeyC";
}

export class CompendiumOverlay {
  private static current: CompendiumOverlay | undefined;
  private open = false;
  private cursor = 0;
  private raceFilter = RACE_ALL;
  private notice = "";
  private panel: HTMLElement | undefined;

  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (!this.open) {
      if (isCompendiumKey(event.code) && this.host.canOpen()) {
        this.open = true;
        this.cursor = 0;
        this.raceFilter = RACE_ALL;
        this.notice = "";
        this.render();
        event.preventDefault();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.handleKey(event.code);
  };

  constructor(private readonly host: CompendiumOverlayHost) {
    CompendiumOverlay.current?.destroy();
    CompendiumOverlay.current = this;
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler, true);
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  close(): void {
    const wasOpen = this.open;
    this.open = false;
    this.panel?.remove();
    this.panel = undefined;
    if (wasOpen) this.host.onClose();
  }

  destroy(): void {
    this.close();
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyHandler, true);
    }
    if (CompendiumOverlay.current === this) CompendiumOverlay.current = undefined;
  }

  private races(): string[] {
    const set = new Set<string>();
    for (const r of this.host.rows()) set.add(r.race);
    return [RACE_ALL, ...[...set].sort()];
  }

  private filtered(): CompendiumRow[] {
    const rows = this.host.rows();
    return this.raceFilter === RACE_ALL ? rows : rows.filter((r) => r.race === this.raceFilter);
  }

  private handleKey(code: string): void {
    if (code === "Escape" || code === "KeyX" || isCompendiumKey(code)) {
      this.close();
      return;
    }
    const rows = this.filtered();
    if (code === "ArrowUp") this.cursor = Math.max(0, this.cursor - 1);
    else if (code === "ArrowDown") this.cursor = Math.min(Math.max(0, rows.length - 1), this.cursor + 1);
    else if (code === "KeyQ" || code === "ArrowLeft") this.cycleRace(-1);
    else if (code === "KeyE" || code === "ArrowRight") this.cycleRace(1);
    else if (code === "KeyZ" || code === "Enter") this.resummon(rows[this.cursor]);
    this.render();
  }

  private cycleRace(dir: number): void {
    const races = this.races();
    const i = races.indexOf(this.raceFilter);
    this.raceFilter = races[(i + dir + races.length) % races.length];
    this.cursor = 0;
    this.notice = "";
  }

  private resummon(row: CompendiumRow | undefined): void {
    if (!row) return;
    if (row.owned) { this.notice = `${row.name} is already in your party.`; return; }
    if (this.host.swagCoins() < row.cost) { this.notice = "Not enough Swag Coins."; return; }
    const res = this.host.resummon(row.registryId);
    this.notice = res.ok ? `${row.name} answers the call. Welcome back.` : (res.reason ?? "Could not re-summon.");
  }

  private render(): void {
    if (!this.open) return;
    if (!this.panel) {
      this.panel = document.createElement("div");
      this.panel.id = "compendium-overlay";
      this.panel.style.cssText =
        "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;" +
        `background:rgba(0,0,0,0.55);font-family:${CLEAN_UI_FONT_FAMILY};image-rendering:pixelated`;
      document.body.appendChild(this.panel);
    }
    const rows = this.filtered();
    const total = this.host.rows().length;
    const sel = rows[this.cursor];
    const races = this.races();
    const raceTabs = races.map((r) => {
      const on = r === this.raceFilter;
      return `<span style="padding:1px 9px;margin-right:4px;border:2px solid ${on ? EB_BORDER : EB_BEVEL};` +
        `background:${on ? CLEAN_UI_PRIMARY : "transparent"};color:${on ? CLEAN_UI_SELECTION_TEXT : CLEAN_UI_SECONDARY};` +
        `font-size:12px">${r}</span>`;
    }).join("");
    const listHtml = rows.length === 0
      ? `<div style="color:${CLEAN_UI_SECONDARY};padding:10px">No Mons recorded yet. Catch or fuse one.</div>`
      : rows.map((r, i) => {
          const on = i === this.cursor;
          const style = on ? `background:${CLEAN_UI_PRIMARY};color:${CLEAN_UI_SELECTION_TEXT}` : `color:${CLEAN_UI_PRIMARY}`;
          const caret = on ? "&#9654; " : "<span style=\"visibility:hidden\">&#9654; </span>";
          const tag = r.owned ? " (in party)" : "";
          return `<div style="padding:3px 8px;${style}">${caret}<b>${r.name}</b>` +
            `<span style="opacity:.8"> Lv${r.level}${tag}</span>` +
            `<span style="float:right;color:${on ? CLEAN_UI_SELECTION_TEXT : EB_COIN}">${r.owned ? "" : r.cost + " SC"}</span></div>`;
        }).join("");
    // detail panel for the selected mon
    const detail = sel
      ? `<div style="border-top:1px solid ${EB_BEVEL};margin-top:8px;padding-top:8px;display:flex;gap:12px">
          ${sel.spriteUrl ? `<img src="${sel.spriteUrl}" style="width:64px;height:64px;image-rendering:pixelated;flex:none">` : ""}
          <div style="flex:1;color:${CLEAN_UI_PRIMARY};font-size:13px">
            <div><b>${sel.name}</b> &middot; ${sel.race} &middot; ${sel.element}</div>
            <div style="color:${CLEAN_UI_SECONDARY};margin-top:3px">Registered level ${sel.level} &middot; owned ${sel.timesOwned}x</div>
            ${sel.lineage ? `<div style="color:${CLEAN_UI_SECONDARY};margin-top:2px">Lineage: ${sel.lineage}</div>` : ""}
            <div style="margin-top:4px">Moves: ${sel.moves.length ? sel.moves.join(", ") : "none inherited"}</div>
            ${sel.owned ? "" : `<div style="color:${EB_COIN};margin-top:4px">Z: re-summon for ${sel.cost} SC</div>`}
          </div></div>`
      : "";
    this.panel.innerHTML =
      `<div style="width:520px;max-height:430px;overflow-y:auto;background:${EB_FILL};` +
      `border:2px solid ${EB_BORDER};box-shadow:inset 0 0 0 2px ${EB_FILL},inset 0 0 0 3px ${EB_BEVEL};` +
      `padding:12px;font-size:15px;line-height:1.5">
        <div style="display:flex;align-items:center;margin-bottom:7px">
          <b style="color:${CLEAN_UI_PRIMARY}">COMPENDIUM</b>
          <span style="color:${CLEAN_UI_SECONDARY};font-size:12px;margin-left:8px">${total} recorded</span>
          <span style="margin-left:auto;color:${EB_COIN};font-size:14px">${this.host.swagCoins()} SC</span></div>
        <div style="margin-bottom:8px">${raceTabs}</div>
        <div style="max-height:210px;overflow-y:auto">${listHtml}</div>
        ${detail}
        <div style="margin-top:8px;color:${CLEAN_UI_SECONDARY};font-size:12px">Q/E race &nbsp; arrows move &nbsp; Z re-summon &nbsp; X close</div>
        ${this.notice ? `<div style="color:${EB_COIN};font-size:13px;margin-top:4px">${this.notice}</div>` : ""}
      </div>`;
  }
}
