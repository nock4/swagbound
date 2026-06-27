/**
 * In-game music auditioner — a dev-only DOM side panel for figuring out which
 * music track belongs in which place.
 *
 * It plays a candidate track over the live game (muting the game's own music
 * while it does), shows where the player currently is (resolved music cue +
 * sector index + area id), and lets you record "this track -> here" mappings
 * that you can copy out as JSON to seed content/music-manifest.json.
 *
 * Mounted only under import.meta.env.DEV (see main.ts), so it never ships in a
 * production build. The track list comes from the dev-server middleware added
 * in vite.config.ts (`/__audio-list`), which scans apps/game/public/audio — so
 * dropping a new file in there and refreshing makes it appear, no rebuild.
 */

export interface AuditionLocation {
  /** Resolved overworld music cue the game would play here (e.g. "overworld", "area:foo"). */
  cue: string;
  /** Map sector index under the player — what music-manifest areas match on. */
  sectorIndex: number | null;
  /** EB area id for the sector, if known. */
  areaId: number | null;
  x: number;
  y: number;
}

export interface AuditionTarget {
  /** Toggle the game's own music so the audition track plays cleanly over the game. */
  setGameMusicEnabled(enabled: boolean): void;
  /** Current player location, or null when no world scene is active. */
  getLocation(): AuditionLocation | null;
}

interface AudioTrack {
  name: string;
  url: string;
}

interface Assignment {
  track: string;
  cue: string;
  sectorIndex: number | null;
  areaId: number | null;
}

const ASSIGN_STORAGE_KEY = "swag:music-auditioner:assignments";

let target: AuditionTarget | null = null;

/** Called by the active world scene so the panel can mute it + read location. */
export function publishAuditionTarget(next: AuditionTarget): void {
  target = next;
}

let mounted = false;

export function mountMusicAuditioner(): void {
  if (mounted || typeof document === "undefined") {
    return;
  }
  mounted = true;
  new MusicAuditionerPanel();
}

class MusicAuditionerPanel {
  private readonly audio = new Audio();
  private tracks: AudioTrack[] = [];
  private index = -1;
  private assignments: Assignment[] = loadAssignments();
  private collapsed = false;
  private gameMuted = false;

  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly nowEl: HTMLDivElement;
  private readonly trackNameEl: HTMLDivElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly listEl: HTMLDivElement;
  private readonly assignListEl: HTMLDivElement;
  private readonly collapseBtn: HTMLButtonElement;

  constructor() {
    injectStyles();
    this.audio.loop = true;
    this.audio.volume = 0.7;

    this.root = el("div", "swagma-root");
    const header = el("div", "swagma-header");
    const title = el("div", "swagma-title");
    title.textContent = "♪ Track Lab";
    this.collapseBtn = button("–", "swagma-collapse", () => this.toggleCollapse());
    header.append(title, this.collapseBtn);

    this.body = el("div", "swagma-body");

    this.nowEl = el("div", "swagma-now");
    this.nowEl.textContent = "Now at: —";

    this.trackNameEl = el("div", "swagma-trackname");
    this.trackNameEl.textContent = "No track loaded";

    const controls = el("div", "swagma-controls");
    const prev = button("⏮", "swagma-btn", () => this.cycle(-1));
    this.playBtn = button("▶", "swagma-btn swagma-play", () => this.togglePlay());
    const next = button("⏭", "swagma-btn", () => this.cycle(1));
    controls.append(prev, this.playBtn, next);

    const volRow = el("div", "swagma-volrow");
    const volLabel = el("span", "swagma-vollabel");
    volLabel.textContent = "vol";
    const vol = document.createElement("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = "100";
    vol.value = "70";
    vol.className = "swagma-vol";
    vol.addEventListener("input", () => {
      this.audio.volume = Number(vol.value) / 100;
      vol.blur();
    });
    const loopBtn = button("loop ✓", "swagma-toggle swagma-on", (btn) => {
      this.audio.loop = !this.audio.loop;
      btn.textContent = this.audio.loop ? "loop ✓" : "loop ✗";
      btn.classList.toggle("swagma-on", this.audio.loop);
    });
    volRow.append(volLabel, vol, loopBtn);

    this.listEl = el("div", "swagma-list");

    const assignBtn = button("＋ Assign track → here", "swagma-assign", () => this.assignHere());
    const assignHead = el("div", "swagma-subhead");
    assignHead.textContent = "Mappings";
    const assignTools = el("div", "swagma-assigntools");
    const copyBtn = button("Copy JSON", "swagma-mini", () => this.copyAssignments());
    const clearBtn = button("Clear", "swagma-mini", () => this.clearAssignments());
    assignTools.append(copyBtn, clearBtn);
    this.assignListEl = el("div", "swagma-assignlist");

    this.body.append(
      this.nowEl,
      this.trackNameEl,
      controls,
      volRow,
      this.listEl,
      assignBtn,
      assignHead,
      assignTools,
      this.assignListEl
    );
    this.root.append(header, this.body);
    document.body.append(this.root);

    this.audio.addEventListener("ended", () => this.onStopped());
    this.renderAssignments();
    void this.loadTracks();
    window.setInterval(() => this.refreshLocation(), 700);
  }

  private async loadTracks(): Promise<void> {
    try {
      const res = await fetch("/__audio-list");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { tracks?: AudioTrack[] };
      this.tracks = Array.isArray(data.tracks) ? data.tracks : [];
    } catch {
      this.tracks = [];
    }
    this.renderList();
  }

  private renderList(): void {
    this.listEl.replaceChildren();
    if (this.tracks.length === 0) {
      const empty = el("div", "swagma-empty");
      empty.textContent = "No audio files in public/audio. Drop tracks there + refresh.";
      this.listEl.append(empty);
      return;
    }
    this.tracks.forEach((track, i) => {
      const row = button(prettyTrack(track.name), "swagma-row", () => this.select(i, true));
      row.title = track.name;
      if (i === this.index) {
        row.classList.add("swagma-row-active");
      }
      this.listEl.append(row);
    });
  }

  private cycle(delta: number): void {
    if (this.tracks.length === 0) {
      return;
    }
    const start = this.index < 0 ? (delta > 0 ? -1 : 0) : this.index;
    const next = (start + delta + this.tracks.length) % this.tracks.length;
    this.select(next, true);
  }

  private select(i: number, play: boolean): void {
    const track = this.tracks[i];
    if (!track) {
      return;
    }
    this.index = i;
    this.audio.src = track.url;
    this.trackNameEl.textContent = prettyTrack(track.name);
    this.renderList();
    if (play) {
      void this.play();
    }
  }

  private togglePlay(): void {
    if (this.index < 0) {
      this.cycle(1);
      return;
    }
    if (this.audio.paused) {
      void this.play();
    } else {
      this.audio.pause();
      this.onStopped();
    }
  }

  private async play(): Promise<void> {
    try {
      this.muteGame(true);
      await this.audio.play();
      this.playBtn.textContent = "⏸";
    } catch {
      this.muteGame(false);
    }
  }

  private onStopped(): void {
    this.playBtn.textContent = "▶";
    this.muteGame(false);
  }

  private muteGame(mute: boolean): void {
    if (this.gameMuted === mute) {
      return;
    }
    this.gameMuted = mute;
    try {
      target?.setGameMusicEnabled(!mute);
    } catch {
      // No active target — auditioning still works, just nothing to mute.
    }
  }

  private refreshLocation(): void {
    const loc = target?.getLocation?.() ?? null;
    if (!loc) {
      this.nowEl.textContent = "Now at: — (no world scene)";
      return;
    }
    const sector = loc.sectorIndex === null ? "?" : String(loc.sectorIndex);
    // areaIds can hold large packed values; only surface a clean small id.
    const area = loc.areaId !== null && loc.areaId >= 0 && loc.areaId < 100000 ? ` · area ${loc.areaId}` : "";
    this.nowEl.innerHTML =
      `Now at: <b>${escapeHtml(loc.cue)}</b><br>` +
      `sector ${sector}${area} · (${loc.x},${loc.y})`;
  }

  private assignHere(): void {
    const track = this.tracks[this.index];
    const loc = target?.getLocation?.() ?? null;
    if (!track || !loc) {
      return;
    }
    this.assignments = this.assignments.filter(
      (a) => !(a.sectorIndex === loc.sectorIndex && a.track === track.name)
    );
    this.assignments.unshift({
      track: track.name,
      cue: loc.cue,
      sectorIndex: loc.sectorIndex,
      areaId: loc.areaId
    });
    saveAssignments(this.assignments);
    this.renderAssignments();
  }

  private renderAssignments(): void {
    this.assignListEl.replaceChildren();
    if (this.assignments.length === 0) {
      const empty = el("div", "swagma-empty");
      empty.textContent = "Walk somewhere, pick a track, hit Assign.";
      this.assignListEl.append(empty);
      return;
    }
    this.assignments.forEach((a, i) => {
      const row = el("div", "swagma-assignrow");
      const text = el("span", "swagma-assigntext");
      text.textContent = `${a.cue} · sec ${a.sectorIndex ?? "?"} → ${a.track}`;
      const del = button("✕", "swagma-del", () => {
        this.assignments.splice(i, 1);
        saveAssignments(this.assignments);
        this.renderAssignments();
      });
      row.append(text, del);
      this.assignListEl.append(row);
    });
  }

  private async copyAssignments(): Promise<void> {
    const json = JSON.stringify(this.assignments, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      console.log("[music-auditioner] assignments:\n" + json);
    }
  }

  private clearAssignments(): void {
    this.assignments = [];
    saveAssignments(this.assignments);
    this.renderAssignments();
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.body.style.display = this.collapsed ? "none" : "";
    this.collapseBtn.textContent = this.collapsed ? "+" : "–";
  }
}

function loadAssignments(): Assignment[] {
  try {
    const raw = globalThis.localStorage?.getItem(ASSIGN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Assignment[]) : [];
  } catch {
    return [];
  }
}

function saveAssignments(assignments: Assignment[]): void {
  try {
    globalThis.localStorage?.setItem(ASSIGN_STORAGE_KEY, JSON.stringify(assignments));
  } catch {
    // Storage unavailable — keep the in-memory copy.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(
  label: string,
  className: string,
  onClick: (btn: HTMLButtonElement) => void
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener("click", () => {
    onClick(btn);
    // Return keyboard focus to the game so arrow keys keep driving the player.
    btn.blur();
  });
  return btn;
}

/**
 * Turn a track path like "jammers/059__raymond-scott__lightworks.mp3" into a
 * readable "Raymond Scott — Lightworks" for the list; the raw filename is kept
 * for assignment/export so it still maps back to the manifest.
 */
function prettyTrack(name: string): string {
  const base = name.replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "");
  const parts = base.replace(/^\d+__/, "").split("__");
  const titleCase = (s: string) =>
    s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  if (parts.length >= 2) {
    return `${titleCase(parts[0])} — ${titleCase(parts.slice(1).join(" "))}`;
  }
  return titleCase(base);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) {
    return;
  }
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.swagma-root{position:fixed;top:12px;right:12px;width:212px;z-index:9999;
  font-family:'Pixelify Sans',ui-monospace,monospace;color:#EEF1F6;
  background:rgba(8,10,16,.92);border:2px solid rgba(255,255,255,.85);border-radius:10px;
  box-shadow:0 6px 24px rgba(0,0,0,.5);overflow:hidden;font-size:12px;line-height:1.35;}
.swagma-header{display:flex;align-items:center;justify-content:space-between;
  padding:6px 9px;background:rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.18);}
.swagma-title{font-size:13px;letter-spacing:.5px;}
.swagma-collapse{all:unset;cursor:pointer;width:18px;height:18px;text-align:center;
  border-radius:4px;font-size:15px;line-height:18px;}
.swagma-collapse:hover{background:rgba(255,255,255,.15);}
.swagma-body{padding:9px;display:flex;flex-direction:column;gap:8px;}
.swagma-now{font-size:11px;color:#cdd5e3;background:rgba(255,255,255,.05);
  border-radius:6px;padding:5px 7px;}
.swagma-now b{color:#fff;}
.swagma-trackname{font-size:12px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.swagma-controls{display:flex;gap:6px;}
.swagma-btn{all:unset;cursor:pointer;flex:1;text-align:center;padding:5px 0;
  background:rgba(255,255,255,.08);border-radius:6px;font-size:14px;}
.swagma-btn:hover{background:rgba(255,255,255,.18);}
.swagma-play{flex:1.4;}
.swagma-volrow{display:flex;align-items:center;gap:6px;}
.swagma-vollabel{font-size:10px;color:#9aa3b2;}
.swagma-vol{flex:1;accent-color:#fff;}
.swagma-toggle{all:unset;cursor:pointer;font-size:10px;padding:3px 6px;border-radius:5px;
  background:rgba(255,255,255,.08);color:#9aa3b2;}
.swagma-toggle.swagma-on{color:#0a0a0a;background:#fff;}
.swagma-list{display:flex;flex-direction:column;gap:2px;max-height:148px;overflow-y:auto;
  border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:3px;}
.swagma-row{all:unset;cursor:pointer;display:block;flex:0 0 auto;padding:3px 6px;border-radius:4px;
  font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.swagma-row:hover{background:rgba(255,255,255,.12);}
.swagma-row-active{background:#fff;color:#0a0a0a;}
.swagma-empty{font-size:10px;color:#9aa3b2;padding:4px 6px;}
.swagma-assign{all:unset;cursor:pointer;text-align:center;padding:6px 0;border-radius:6px;
  background:rgba(120,200,140,.18);color:#cfeed8;font-size:11px;}
.swagma-assign:hover{background:rgba(120,200,140,.3);}
.swagma-subhead{font-size:10px;color:#9aa3b2;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}
.swagma-assigntools{display:flex;gap:6px;}
.swagma-mini{all:unset;cursor:pointer;flex:1;text-align:center;font-size:10px;padding:4px 0;
  background:rgba(255,255,255,.08);border-radius:5px;}
.swagma-mini:hover{background:rgba(255,255,255,.18);}
.swagma-assignlist{display:flex;flex-direction:column;gap:2px;max-height:96px;overflow-y:auto;}
.swagma-assignrow{display:flex;flex:0 0 auto;align-items:center;gap:4px;font-size:10px;color:#cdd5e3;}
.swagma-assigntext{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.swagma-del{all:unset;cursor:pointer;color:#e7a3a3;padding:0 3px;}
.swagma-del:hover{color:#ff7676;}
`;
  document.head.append(style);
}
