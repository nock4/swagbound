/**
 * Farm Management overlay (Mons Ranch): SHOP / JOBS / DECOR / LEDGER tabs in
 * the DOM-overlay pattern (see monsOverlay.ts). Buying a structure hands off
 * to the in-world placement mode via host.beginPlacement.
 *
 * Keys: F opens (on ranch land), arrows navigate, Z/Enter select, X/Esc close,
 * Q/E switch tabs.
 */
import {
  DECOR_CATALOG,
  FARM_CATALOG,
  type FarmBuildingKind,
  type FarmDecorKind,
  type FarmState
} from "./farmState";
import { discountedPrice } from "./farmPerks";
import {
  CLEAN_UI_FONT_FAMILY,
  CLEAN_UI_HP,
  CLEAN_UI_PRIMARY,
  CLEAN_UI_SECONDARY,
  CLEAN_UI_SELECTION_TEXT
} from "./cleanUi";

// EarthBound clean-window tokens (mirror cleanUi.ts) so the farm menu reads as
// the same square near-black EB window the rest of the game uses.
const EB_FILL = "#101010";
const EB_BORDER = "#ffffff";
const EB_BEVEL = "#585868";
const EB_PRIMARY = CLEAN_UI_PRIMARY;      // #EEF1F6
const EB_SECONDARY = CLEAN_UI_SECONDARY;  // #9AA3B2
const EB_SELECT_TEXT = CLEAN_UI_SELECTION_TEXT; // #0a0a0a on the reverse-video row
const EB_COIN = "#e6bd54";
const EB_HP = `#${CLEAN_UI_HP.toString(16).padStart(6, "0")}`; // gauge fill
/** A selected menu row: EarthBound reverse video (light bar, dark text) + caret. */
function ebRowStyle(selected: boolean): string {
  return selected
    ? `background:${EB_PRIMARY};color:${EB_SELECT_TEXT}`
    : `color:${EB_PRIMARY}`;
}
function ebCaret(selected: boolean): string {
  return selected ? '<span style="margin-right:4px">&#9654;</span>' : '<span style="margin-right:4px;visibility:hidden">&#9654;</span>';
}

export type FarmOverlayHost = {
  canOpen(): boolean;
  farm(): FarmState;
  monNameById(registryId: string): string | undefined;
  roster(): Array<{ registryId: string; name: string; level: number }>;
  beginPlacement(kind: string, decor: boolean, price: number): void;
  onClose(): void;
};

type Tab = "shop" | "jobs" | "decor" | "ledger";
const TABS: Tab[] = ["shop", "jobs", "decor", "ledger"];

const BUILDING_ORDER: FarmBuildingKind[] = [
  "monBarn", "trainingYard", "itemWorks", "snackKitchen", "monBath", "gachaShrine", "billboard"
];
const DECOR_ORDER: FarmDecorKind[] = [
  "fenceH", "fenceV", "pathTile", "lamp", "statueMon", "topiary", "ranchFlag", "bench", "crate", "well"
];

function isFarmOverlayKey(code: string): boolean {
  return code === "KeyF";
}

export class FarmOverlay {
  private static current: FarmOverlay | undefined;
  private open = false;
  private tab: Tab = "shop";
  private cursor = 0;
  private notice = "";
  private jobMode: { kind: "actions"; row: number; cursor: number } | { kind: "assign"; row: number; cursor: number } | undefined;
  private panel: HTMLElement | undefined;

  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (!this.open) {
      if (isFarmOverlayKey(event.code) && this.host.canOpen()) {
        this.open = true;
        this.tab = "shop";
        this.cursor = 0;
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

  constructor(private readonly host: FarmOverlayHost) {
    FarmOverlay.current?.destroy();
    FarmOverlay.current = this;
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
    if (wasOpen) {
      this.host.onClose();
    }
  }

  destroy(): void {
    this.close();
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyHandler, true);
    }
    if (FarmOverlay.current === this) {
      FarmOverlay.current = undefined;
    }
  }

  private rowsForTab(): number {
    if (this.tab === "shop") return BUILDING_ORDER.length;
    if (this.tab === "decor") return DECOR_ORDER.length;
    if (this.tab === "jobs") return this.host.farm().buildings.length;
    return 0;
  }

  private handleKey(code: string): void {
    if (this.jobMode) {
      this.handleJobModeKey(code);
      this.render();
      return;
    }
    if (code === "Escape" || code === "KeyX" || isFarmOverlayKey(code)) {
      this.close();
      return;
    }
    const rows = this.rowsForTab();
    if (code === "ArrowUp") this.cursor = Math.max(0, this.cursor - 1);
    else if (code === "ArrowDown") this.cursor = Math.min(Math.max(0, rows - 1), this.cursor + 1);
    else if (code === "KeyQ" || code === "ArrowLeft") {
      this.tab = TABS[(TABS.indexOf(this.tab) + TABS.length - 1) % TABS.length];
      this.cursor = 0;
      this.notice = "";
    } else if (code === "KeyE" || code === "ArrowRight") {
      this.tab = TABS[(TABS.indexOf(this.tab) + 1) % TABS.length];
      this.cursor = 0;
      this.notice = "";
    } else if (code === "KeyZ" || code === "Enter") {
      this.confirm();
    }
    this.render();
  }

  private handleJobModeKey(code: string): void {
    const farm = this.host.farm();
    const mode = this.jobMode;
    if (!mode) return;
    const building = farm.buildings[mode.row];
    if (!building) {
      this.jobMode = undefined;
      return;
    }
    if (code === "Escape" || code === "KeyX") {
      this.jobMode = mode.kind === "assign" ? { kind: "actions", row: mode.row, cursor: 0 } : undefined;
      return;
    }
    if (mode.kind === "actions") {
      const actions = 4;
      if (code === "ArrowUp") mode.cursor = Math.max(0, mode.cursor - 1);
      else if (code === "ArrowDown") mode.cursor = Math.min(actions - 1, mode.cursor + 1);
      else if (code === "KeyZ" || code === "Enter") {
        if (mode.cursor === 0) {
          this.jobMode = { kind: "assign", row: mode.row, cursor: 0 };
        } else if (mode.cursor === 1) {
          for (const id of [...building.assignedMonIds]) farm.recallMon(building.id, id);
          building.jobRecipeId = undefined;
          this.notice = "Crew recalled.";
          this.jobMode = undefined;
        } else {
          if (mode.cursor === 2) {
            const entry = FARM_CATALOG[building.kind];
            const nextPrice = entry.price[building.tier];
            if (nextPrice === undefined) this.notice = "Already top tier.";
            else if (!farm.spendCoins(nextPrice)) this.notice = "Not enough Swag Coins.";
            else {
              farm.upgradeBuilding(building.id);
              this.notice = `${entry.name} upgraded to tier ${building.tier}.`;
            }
          } else {
            const name = FARM_CATALOG[building.kind].name;
            const refund = farm.sellBuilding(building.id);
            this.notice = refund !== undefined ? `Sold ${name} for ${refund} SC.` : "Could not sell.";
          }
          this.jobMode = undefined;
        }
      }
      return;
    }
    // assign mode
    const available = this.availableCrew();
    if (code === "ArrowUp") mode.cursor = Math.max(0, mode.cursor - 1);
    else if (code === "ArrowDown") mode.cursor = Math.min(Math.max(0, available.length - 1), mode.cursor + 1);
    else if (code === "KeyZ" || code === "Enter") {
      const pick = available[mode.cursor];
      if (!pick) return;
      if (farm.assignMon(building.id, pick.registryId)) {
        building.jobRecipeId = "crew";
        this.notice = `${pick.name} reports for duty.`;
      }
      this.jobMode = { kind: "actions", row: mode.row, cursor: 0 };
    }
  }

  private sellRefund(): number {
    const building = this.host.farm().buildings[this.jobMode?.row ?? -1];
    if (!building) return 0;
    const total = FARM_CATALOG[building.kind].price.slice(0, building.tier).reduce((a, b) => a + b, 0);
    return Math.floor(total * 0.6);
  }

  private availableCrew(): Array<{ registryId: string; name: string; level: number }> {
    const farm = this.host.farm();
    const assigned = new Set(farm.buildings.flatMap((b) => b.assignedMonIds));
    return this.host.roster().filter((m) => !assigned.has(m.registryId));
  }

  private confirm(): void {
    const farm = this.host.farm();
    if (this.tab === "shop") {
      const kind = BUILDING_ORDER[this.cursor];
      const entry = FARM_CATALOG[kind];
      const price = discountedPrice(entry.price[0] ?? 0, farm.swagRating());
      if (farm.swagCoins < price) {
        this.notice = "Not enough Swag Coins.";
        return;
      }
      this.close();
      this.host.beginPlacement(kind, false, price);
      return;
    }
    if (this.tab === "decor") {
      const kind = DECOR_ORDER[this.cursor];
      const price = discountedPrice(DECOR_CATALOG[kind].price, farm.swagRating());
      if (farm.swagCoins < price) {
        this.notice = "Not enough Swag Coins.";
        return;
      }
      this.close();
      this.host.beginPlacement(kind, true, price);
      return;
    }
    if (this.tab === "jobs") {
      const building = farm.buildings[this.cursor];
      if (!building) return;
      this.jobMode = { kind: "actions", row: this.cursor, cursor: 0 };
    }
  }

  private jobMenuHtml(): string {
    const mode = this.jobMode;
    if (!mode) return "";
    if (mode.kind === "actions") {
      const items = ["Assign a mon", "Recall crew", "Upgrade", `Sell (refund ${this.sellRefund()})`];
      return `<div style="margin-top:5px;border-top:1px solid #444;padding-top:4px">` +
        items.map((label, i) =>
          `<div style="padding:2px 6px;font-size:12px;${i === mode.cursor ? "background:#33333d;color:#f2efe6" : "color:#a9a390"}">${label}</div>`
        ).join("") + `</div>`;
    }
    const crew = this.availableCrew();
    return `<div style="margin-top:5px;border-top:1px solid ${EB_BEVEL};padding-top:4px">` +
      (crew.length === 0
        ? `<div style="padding:2px 8px;font-size:13px;color:${EB_SECONDARY}">Nobody is free.</div>`
        : crew.map((m, i) =>
            `<div style="padding:2px 8px;font-size:13px;${ebRowStyle(i === mode.cursor)}">${ebCaret(i === mode.cursor)}${m.name}<span style="float:right">Lv${m.level}</span></div>`
          ).join("")) + `</div>`;
  }

  private barHtml(fraction: number): string {
    const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    return `<div style="height:7px;background:${EB_FILL};border:1px solid ${EB_BEVEL};margin-top:3px">
      <div style="height:100%;width:${pct}%;background:${EB_HP}"></div></div>`;
  }

  private render(): void {
    if (!this.open) return;
    if (!this.panel) {
      this.panel = document.createElement("div");
      this.panel.id = "farm-overlay";
      this.panel.style.cssText =
        "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;" +
        `background:rgba(0,0,0,0.55);font-family:${CLEAN_UI_FONT_FAMILY};image-rendering:pixelated`;
      document.body.appendChild(this.panel);
    }
    const farm = this.host.farm();
    const tabsHtml = TABS.map((t) => {
      const on = t === this.tab;
      return `<span style="padding:2px 11px;margin-right:5px;border:2px solid ${on ? EB_BORDER : EB_BEVEL};` +
        `background:${on ? EB_PRIMARY : "transparent"};color:${on ? EB_SELECT_TEXT : EB_SECONDARY};` +
        `text-transform:uppercase;font-size:13px;letter-spacing:.04em">${t}</span>`;
    }).join("");
    let body = "";
    if (this.tab === "shop") {
      body = BUILDING_ORDER.map((kind, i) => {
        const e = FARM_CATALOG[kind];
        const sel = i === this.cursor;
        const descColor = sel ? EB_SELECT_TEXT : EB_SECONDARY;
        return `<div style="padding:4px 8px;${ebRowStyle(sel)}">
          ${ebCaret(sel)}<b>${e.name}</b>
          <span style="float:right">${discountedPrice(e.price[0], farm.swagRating())} SC</span>
          <div style="color:${descColor};font-size:12.5px;margin-left:20px">${e.desc}</div></div>`;
      }).join("");
    } else if (this.tab === "decor") {
      body = DECOR_ORDER.map((kind, i) => {
        const e = DECOR_CATALOG[kind];
        const sel = i === this.cursor;
        return `<div style="padding:3px 8px;${ebRowStyle(sel)}">
          ${ebCaret(sel)}<b>${e.name}</b>
          <span style="float:right">${discountedPrice(e.price, farm.swagRating())} SC</span></div>`;
      }).join("");
    } else if (this.tab === "jobs") {
      body = farm.buildings.length === 0
        ? `<div style="color:${EB_SECONDARY};padding:8px">Nothing built yet. Visit the SHOP.</div>`
        : farm.buildings.map((b, i) => {
            const e = FARM_CATALOG[b.kind];
            const sel = i === this.cursor;
            const sub = sel ? EB_SELECT_TEXT : EB_SECONDARY;
            const workers = b.assignedMonIds
              .map((id) => this.host.monNameById(id) ?? id)
              .join(", ") || "nobody";
            const next = e.price[b.tier];
            return `<div style="padding:4px 8px;${ebRowStyle(sel)}">
              ${ebCaret(sel)}<b>${e.name}</b> <span style="opacity:.85">T${b.tier}</span>
              <span style="float:right">${next !== undefined ? `Z: upgrade ${next} SC` : "top tier"}</span>
              <div style="color:${sub};font-size:12.5px;margin-left:20px">crew: ${workers}</div>
              <div style="margin-left:20px">${this.barHtml((b.progressSteps % 300) / 300)}</div>
              ${sel && this.jobMode ? `<div style="margin-left:20px">${this.jobMenuHtml()}</div>` : ""}</div>`;
          }).join("");
    } else {
      body = `<div style="padding:10px;color:${EB_PRIMARY}">
        <div style="font-size:16px">Swag Coins: <b style="color:${EB_COIN}">${farm.swagCoins}</b></div>
        <div style="margin-top:7px;font-size:16px">Swag Rating: <b style="color:${EB_HP}">${farm.swagRating()}</b></div>
        <div style="margin-top:7px;color:${EB_SECONDARY};font-size:13px">
          Buildings: ${farm.buildings.length} &middot; Decor: ${farm.decor.length}</div>
      </div>`;
    }
    // EarthBound clean window: opaque near-black, white border with an inner bevel.
    this.panel.innerHTML =
      `<div style="width:452px;max-height:404px;overflow-y:auto;background:${EB_FILL};` +
      `border:2px solid ${EB_BORDER};box-shadow:inset 0 0 0 2px ${EB_FILL},inset 0 0 0 3px ${EB_BEVEL};` +
      `padding:12px;font-size:15px;line-height:1.5">
        <div style="margin-bottom:9px;display:flex;align-items:center">
          <span>${tabsHtml}</span>
          <span style="margin-left:auto;color:${EB_COIN};font-size:14px">${farm.swagCoins} SC</span></div>
        ${body}
        <div style="margin-top:9px;color:${EB_SECONDARY};font-size:12px">Q/E tabs &nbsp; arrows move &nbsp; Z select &nbsp; X close</div>
        ${this.notice ? `<div style="color:${EB_COIN};font-size:13px;margin-top:5px">${this.notice}</div>` : ""}
      </div>`;
  }
}
