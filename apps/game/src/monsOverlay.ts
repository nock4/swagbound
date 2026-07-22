/**
 * Mons roster overlay. Press O in the overworld (act 2+, once the farm is met)
 * to manage the mon roster: set the active companion, pet (bond), release, and
 * fuse two mons at the Fusion Altar. DOM overlay in the quest-journal pattern:
 * keyboard-driven, no Phaser scene, reads/writes MonsState through a host.
 *
 * Keys: arrows move, Z/Enter select, X/Esc close/back, F fusion mode,
 * P pet, R release (with confirm).
 */
import type { MonAbilities, MonsRegistryEntry } from "@eb/schemas";
import { monDisplayName, monKnownAbilities, monStatsAtLevel, type FusionPreview, type OwnedMon } from "./monsModel";

export interface MonsOverlayHost {
  roster(): readonly OwnedMon[];
  entryFor(mon: OwnedMon): MonsRegistryEntry | undefined;
  activeIndex(): number | undefined;
  setActive(index: number | undefined): boolean;
  /** Pet the mon at index. Returns its new bond plus a personality-flavored line
   *  (name already substituted), or undefined if the index is empty. */
  pet(index: number): { bond: number; line: string } | undefined;
  release(index: number): boolean;
  previewFusion(a: number, b: number): FusionPreview | undefined;
  fuse(a: number, b: number, picks: string[]): OwnedMon | undefined;
  abilities(): MonAbilities | undefined;
  atFusionAltar(): boolean;
  canOpen(): boolean;
  onRosterChanged(): void;
  /** Fired when the player enters fuse-pick mode at the altar (altar hum cue). */
  onFuseMode(): void;
  /** Fired when the overlay closes, so the scene can play a deferred beat (the
   *  Fusion Altar reaction, which is only visible once the DOM overlay is gone). */
  onClose(): void;
}

export function isMonsOverlayKey(code: string): boolean {
  return code === "KeyO";
}

type OverlayMode =
  | { kind: "list"; confirmRelease?: boolean }
  | { kind: "fuse-pick"; first?: number }
  | { kind: "fuse-preview"; a: number; b: number; preview: FusionPreview; picks: string[]; pickCursor: number };

export class MonsOverlay {
  private static current: MonsOverlay | undefined;
  private open = false;
  private cursor = 0;
  private mode: OverlayMode = { kind: "list" };
  private panel: HTMLElement | undefined;
  private notice = "";
  // Which roster row just got petted (for a one-shot wiggle) and a nonce so the
  // CSS animation re-triggers on every pet even when the same row repeats.
  private wiggleRow = -1;
  private wiggleNonce = 0;

  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (!this.open) {
      if (isMonsOverlayKey(event.code) && this.host.canOpen()) {
        this.open = true;
        this.cursor = 0;
        this.mode = { kind: "list" };
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

  constructor(private readonly host: MonsOverlayHost) {
    MonsOverlay.current?.destroy();
    MonsOverlay.current = this;
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler, true);
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  openOverlay(): void {
    if (!this.open && this.host.canOpen()) {
      this.open = true;
      this.cursor = 0;
      this.mode = { kind: "list" };
      this.notice = "";
      this.render();
    }
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
    if (MonsOverlay.current === this) {
      MonsOverlay.current = undefined;
    }
  }

  private handleKey(code: string): void {
    const count = this.host.roster().length;
    const mode = this.mode;
    if (code === "Escape" || code === "KeyX" || isMonsOverlayKey(code)) {
      if (mode.kind === "fuse-preview") {
        this.mode = { kind: "fuse-pick", first: mode.a };
      } else if (mode.kind === "fuse-pick") {
        this.mode = { kind: "list" };
      } else if (mode.kind === "list" && mode.confirmRelease) {
        this.mode = { kind: "list" };
      } else {
        this.close();
        return;
      }
      this.notice = "";
      this.render();
      return;
    }
    if (code === "ArrowDown" || code === "ArrowUp") {
      if (mode.kind === "fuse-preview") {
        // +1 row for the FUSE commit line at the bottom.
        const total = (mode.preview.inheritable?.length ?? 0) + 1;
        mode.pickCursor = (mode.pickCursor + (code === "ArrowDown" ? 1 : total - 1)) % total;
      } else if (count > 0) {
        this.cursor = (this.cursor + (code === "ArrowDown" ? 1 : count - 1)) % count;
        this.notice = "";
      }
      this.render();
      return;
    }
    if (code === "KeyZ" || code === "Enter") {
      this.confirm();
      return;
    }
    if (mode.kind === "list") {
      if (code === "KeyP") {
        const result = this.host.pet(this.cursor);
        if (result) {
          this.notice = result.line;
          this.wiggleRow = this.cursor;
          this.wiggleNonce += 1;
          this.host.onRosterChanged();
        }
        this.render();
        return;
      }
      if (code === "KeyR" && count > 0) {
        this.mode = { kind: "list", confirmRelease: true };
        this.render();
        return;
      }
      if (code === "KeyF") {
        if (!this.host.atFusionAltar()) {
          this.notice = "Fusion happens at the altar on the farm.";
        } else if (count < 2) {
          this.notice = "Fusion takes two mons.";
        } else {
          this.mode = { kind: "fuse-pick" };
          this.notice = "";
          this.host.onFuseMode();
        }
        this.render();
        return;
      }
    }
  }

  private confirm(): void {
    const mode = this.mode;
    const count = this.host.roster().length;
    if (count === 0) {
      return;
    }
    if (mode.kind === "list") {
      if (mode.confirmRelease) {
        const name = this.nameAt(this.cursor);
        if (this.host.release(this.cursor)) {
          this.notice = `${name} wanders off. The gate stays open behind it.`;
          this.cursor = Math.min(this.cursor, Math.max(0, this.host.roster().length - 1));
          this.host.onRosterChanged();
        }
        this.mode = { kind: "list" };
        this.render();
        return;
      }
      const wasActive = this.host.activeIndex() === this.cursor;
      this.host.setActive(wasActive ? undefined : this.cursor);
      this.notice = wasActive
        ? `${this.nameAt(this.cursor)} stays at the farm.`
        : `${this.nameAt(this.cursor)} is coming along!`;
      this.host.onRosterChanged();
      this.render();
      return;
    }
    if (mode.kind === "fuse-pick") {
      if (mode.first === undefined) {
        this.mode = { kind: "fuse-pick", first: this.cursor };
      } else if (mode.first !== this.cursor) {
        const preview = this.host.previewFusion(mode.first, this.cursor);
        if (preview?.ok) {
          this.mode = { kind: "fuse-preview", a: mode.first, b: this.cursor, preview, picks: [], pickCursor: 0 };
        } else {
          this.notice = preview?.reason === "secret-parent"
            ? "That one is one of a kind. It will not fuse."
            : "Those two will not take.";
        }
      }
      this.render();
      return;
    }
    // fuse-preview: Z toggles an inheritance pick; Enter-with-two or on FUSE row commits
    const inheritable = mode.preview.inheritable ?? [];
    if (mode.pickCursor < inheritable.length) {
      const id = inheritable[mode.pickCursor];
      if (mode.picks.includes(id)) {
        mode.picks = mode.picks.filter((p) => p !== id);
      } else if (mode.picks.length < 2) {
        mode.picks = [...mode.picks, id];
      }
      // auto-commit shortcut: after choosing 2, another Z on the same row commits
      this.render();
      return;
    }
    this.commitFusion();
  }

  /** Commit the fusion in fuse-preview mode (bound to the FUSE row / KeyF). */
  commitFusion(): void {
    const mode = this.mode;
    if (mode.kind !== "fuse-preview") {
      return;
    }
    const nameA = this.nameAt(mode.a);
    const nameB = this.nameAt(mode.b);
    const fused = this.host.fuse(mode.a, mode.b, mode.picks);
    if (fused) {
      const entry = this.host.entryFor(fused);
      this.notice = `${nameA} and ${nameB} lean together... ${entry ? monDisplayName(entry) : "Something new"} steps out.`;
      this.cursor = Math.max(0, this.host.roster().length - 1);
      this.host.onRosterChanged();
    } else {
      this.notice = "The altar hums and changes its mind.";
    }
    this.mode = { kind: "list" };
    this.render();
  }

  private nameAt(index: number): string {
    const mon = this.host.roster()[index];
    const entry = mon ? this.host.entryFor(mon) : undefined;
    return entry ? monDisplayName(entry) : "???";
  }

  private render(): void {
    if (!this.open) {
      return;
    }
    if (!this.panel) {
      this.panel = document.createElement("div");
      this.panel.id = "mons-overlay";
      this.panel.style.cssText = [
        "position:fixed", "inset:0", "z-index:60", "display:flex",
        "align-items:center", "justify-content:center",
        "background:rgba(4,4,12,0.82)", "font-family:'Pixelify Sans',monospace",
        "color:#f2efe6"
      ].join(";");
      document.body.appendChild(this.panel);
    }
    const roster = this.host.roster();
    const active = this.host.activeIndex();
    const mode = this.mode;
    const rows = roster.map((mon, index) => {
      const entry = this.host.entryFor(mon);
      const name = entry ? monDisplayName(entry) : mon.registryId;
      const race = entry?.race ?? "?";
      const tier = "★".repeat(entry?.tier ?? 0);
      const marks = [
        index === active ? "◆" : " ",
        mode.kind === "fuse-pick" && mode.first === index ? "A" : " "
      ].join("");
      const cursor = index === this.cursor ? "▶" : " ";
      const wiggle = index === this.wiggleRow
        ? `animation:monWiggle .42s ease-in-out;`
        : "";
      return `<div style="padding:2px 8px;transform-origin:left center;${wiggle}${index === this.cursor ? "background:#2c2c5e;" : ""}">` +
        `${cursor}${marks} ${escapeHtml(name)} <span style="opacity:.75">Lv${mon.level} ${escapeHtml(race)} ${tier} bond ${mon.bond}</span></div>`;
    }).join("");
    // The wiggle is a one-shot: consume it so arrow-key re-renders don't replay it.
    this.wiggleRow = -1;
    let body = "";
    if (mode.kind === "fuse-preview") {
      const preview = mode.preview;
      const result = preview.result;
      const resultName = result ? monDisplayName(result) : "?";
      const inheritable = preview.inheritable ?? [];
      const abilities = this.host.abilities();
      const pickRows = inheritable.map((id, index) => {
        const name = abilities?.abilities[id]?.name ?? id;
        const mark = mode.picks.includes(id) ? "[x]" : "[ ]";
        const cur = index === mode.pickCursor ? "▶" : " ";
        return `<div>${cur}${mark} ${escapeHtml(name)}</div>`;
      }).join("");
      const commitCur = mode.pickCursor >= inheritable.length ? "▶" : " ";
      // Warn when the fusion result is weaker than the stronger parent (a level
      // floor is not a power floor - a low-stat race can come back worse).
      const power = (entry: MonsRegistryEntry | undefined, level: number) => {
        if (!entry) return 0;
        const s = monStatsAtLevel(entry, level);
        return s.maxHp + s.offense * 2 + s.defense * 2;
      };
      const parentA = this.host.roster()[mode.a];
      const parentB = this.host.roster()[mode.b];
      const bestParentPower = Math.max(
        power(parentA ? this.host.entryFor(parentA) : undefined, parentA?.level ?? 1),
        power(parentB ? this.host.entryFor(parentB) : undefined, parentB?.level ?? 1)
      );
      const resultPower = result && preview.projectedLevel !== undefined ? power(result, preview.projectedLevel) : 0;
      const downgrade = !preview.secretResult && resultPower > 0 && resultPower < bestParentPower;
      const statLine = result && preview.projectedLevel !== undefined && !preview.secretResult
        ? (() => {
            const s = monStatsAtLevel(result, preview.projectedLevel);
            return `<div style="opacity:.8;font-size:12px">HP ${s.maxHp}  OFF ${s.offense}  DEF ${s.defense}${downgrade ? ` <span style="color:#ff8a8a">(weaker than a parent)</span>` : ""}</div>`;
          })()
        : "";
      body = `<div style="margin-top:8px;border-top:1px solid #555;padding-top:6px">` +
        `<div>${escapeHtml(this.nameAt(mode.a))} + ${escapeHtml(this.nameAt(mode.b))}</div>` +
        `<div>&gt; ${preview.secretResult ? "?????" : escapeHtml(resultName)} (Lv${preview.projectedLevel ?? "?"}${result ? ` ${escapeHtml(result.race)}` : ""})</div>` +
        statLine +
        `<div style="margin-top:4px;opacity:.85">Carry up to two moves (Z toggles):</div>${pickRows}` +
        `<div style="margin-top:4px">${commitCur}<b>FUSE</b> (both mons are spent)</div></div>`;
    }
    const header = mode.kind === "list"
      ? (mode.confirmRelease ? `Release ${escapeHtml(this.nameAt(this.cursor))} for good? Z = yes, X = no`
        : "MONS  ◆ companion · Z set/unset · P pet · R release · F fuse · X close")
      : mode.kind === "fuse-pick"
        ? "FUSION: pick two (Z picks, X backs out)"
        : "FUSION PREVIEW";
    this.panel.innerHTML =
      `<style>@keyframes monWiggle{0%{transform:rotate(0)}25%{transform:rotate(-4deg)}55%{transform:rotate(4deg)}80%{transform:rotate(-2deg)}100%{transform:rotate(0)}}</style>` +
      `<div style="min-width:380px;max-width:560px;max-height:80vh;overflow:auto;background:#0d0d1a;border:3px solid #f2efe6;border-radius:2px;padding:10px 12px;font-size:14px;line-height:1.5">` +
      `<div style="margin-bottom:6px;opacity:.9">${header}</div>` +
      (roster.length === 0 ? `<div style="opacity:.8">No mons yet. Wild ones roam past the farm. Rough one up, then talk.</div>` : rows) +
      body +
      (this.notice ? `<div style="margin-top:6px;color:#ffd27a">${escapeHtml(this.notice)}</div>` : "") +
      `</div>`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c
  ));
}

export function monsOverlaySummary(
  roster: readonly OwnedMon[],
  entryFor: (mon: OwnedMon) => MonsRegistryEntry | undefined,
  abilities: MonAbilities | undefined
): string[] {
  return roster.map((mon) => {
    const entry = entryFor(mon);
    if (!entry) {
      return mon.registryId;
    }
    const stats = monStatsAtLevel(entry, mon.level);
    const moves = abilities ? monKnownAbilities(entry, abilities, mon.level, mon.inherited).length : 0;
    return `${monDisplayName(entry)} Lv${mon.level} ${entry.race} hp${stats.maxHp} moves${moves}`;
  });
}
