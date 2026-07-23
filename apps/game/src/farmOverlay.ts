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
    return `<div style="margin-top:5px;border-top:1px solid #444;padding-top:4px">` +
      (crew.length === 0
        ? `<div style="padding:2px 6px;font-size:12px;color:#a9a390">Nobody is free.</div>`
        : crew.map((m, i) =>
            `<div style="padding:2px 6px;font-size:12px;${i === mode.cursor ? "background:#33333d;color:#f2efe6" : "color:#a9a390"}">${m.name} Lv${m.level}</div>`
          ).join("")) + `</div>`;
  }

  private barHtml(fraction: number): string {
    const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    return `<div style="height:8px;background:#222;border:1px solid #555;margin-top:3px">
      <div style="height:100%;width:${pct}%;background:#7cc47c"></div></div>`;
  }

  private render(): void {
    if (!this.open) return;
    if (!this.panel) {
      this.panel = document.createElement("div");
      this.panel.id = "farm-overlay";
      this.panel.style.cssText =
        "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;" +
        "background:rgba(0,0,0,0.55);font-family:'Courier New',monospace;image-rendering:pixelated";
      document.body.appendChild(this.panel);
    }
    const farm = this.host.farm();
    const tabsHtml = TABS.map((t) =>
      `<span style="padding:2px 10px;margin-right:6px;border:2px solid ${t === this.tab ? "#f2efe6" : "#555"};` +
      `color:${t === this.tab ? "#f2efe6" : "#999"};text-transform:uppercase;font-size:12px">${t}</span>`
    ).join("");
    let body = "";
    if (this.tab === "shop") {
      body = BUILDING_ORDER.map((kind, i) => {
        const e = FARM_CATALOG[kind];
        const sel = i === this.cursor;
        return `<div style="padding:5px 8px;${sel ? "background:#26262e;outline:1px solid #f2efe6" : ""}">
          <b style="color:#f2efe6">${e.name}</b>
          <span style="float:right;color:#e0c060">${discountedPrice(e.price[0], farm.swagRating())} SC</span>
          <div style="color:#a9a390;font-size:12px">${e.desc}</div></div>`;
      }).join("");
    } else if (this.tab === "decor") {
      body = DECOR_ORDER.map((kind, i) => {
        const e = DECOR_CATALOG[kind];
        const sel = i === this.cursor;
        return `<div style="padding:4px 8px;${sel ? "background:#26262e;outline:1px solid #f2efe6" : ""}">
          <b style="color:#f2efe6">${e.name}</b>
          <span style="float:right;color:#e0c060">${discountedPrice(e.price, farm.swagRating())} SC</span></div>`;
      }).join("");
    } else if (this.tab === "jobs") {
      body = farm.buildings.length === 0
        ? `<div style="color:#a9a390;padding:8px">Nothing built yet. Visit the SHOP.</div>`
        : farm.buildings.map((b, i) => {
            const e = FARM_CATALOG[b.kind];
            const sel = i === this.cursor;
            const workers = b.assignedMonIds
              .map((id) => this.host.monNameById(id) ?? id)
              .join(", ") || "nobody";
            const next = e.price[b.tier];
            return `<div style="padding:5px 8px;${sel ? "background:#26262e;outline:1px solid #f2efe6" : ""}">
              <b style="color:#f2efe6">${e.name}</b> <span style="color:#8fb3d9">T${b.tier}</span>
              <span style="float:right;color:#e0c060">${next !== undefined ? `Z: upgrade ${next} SC` : "top tier"}</span>
              <div style="color:#a9a390;font-size:12px">crew: ${workers}</div>
              ${this.barHtml((b.progressSteps % 300) / 300)}
              ${sel && this.jobMode ? this.jobMenuHtml() : ""}</div>`;
          }).join("");
    } else {
      body = `<div style="padding:10px;color:#f2efe6">
        <div>Swag Coins: <b style="color:#e0c060">${farm.swagCoins}</b></div>
        <div style="margin-top:6px">Swag Rating: <b style="color:#8fd98f">${farm.swagRating()}</b></div>
        <div style="margin-top:6px;color:#a9a390;font-size:12px">
          Buildings: ${farm.buildings.length} &middot; Decor: ${farm.decor.length}</div>
      </div>`;
    }
    this.panel.innerHTML =
      `<div style="width:430px;max-height:400px;overflow-y:auto;border:3px solid #f2efe6;background:#0d0d1a;padding:10px">
        <div style="margin-bottom:8px">${tabsHtml}
          <span style="float:right;color:#e0c060;font-size:13px">${farm.swagCoins} SC</span></div>
        ${body}
        <div style="margin-top:8px;color:#8a857a;font-size:11px">Q/E tabs &middot; arrows move &middot; Z select &middot; X close</div>
        ${this.notice ? `<div style="color:#e0a060;font-size:12px;margin-top:4px">${this.notice}</div>` : ""}
      </div>`;
  }
}
