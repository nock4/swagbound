/**
 * In-game playtester bug reporter. Press N anywhere to leave a note; it bundles
 * the tester's name, the note, the current save file, story flags / position,
 * the build stamp, a screenshot, and the browser, and POSTs to /api/bug (stored
 * in Cloudflare KV for later review). Falls back to a downloadable file if the
 * endpoint is unreachable, so a report is never lost.
 *
 * Self-contained: initialize once from main.ts; it manages its own DOM + keys.
 */
const NAME_KEY = "swagbound:tester-name";
const FONT = "'EarthBound Dialogue Gold', 'Pixelify Sans', ui-monospace, monospace";

function captureContext(): Record<string, unknown> {
  const g = globalThis as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  try {
    const world = (g.__firstSceneDebug as { player?: unknown; flags?: unknown } | undefined);
    if (world) {
      out.player = world.player;
      out.flags = world.flags;
      out.scene = "world";
    }
  } catch { /* ignore */ }
  try {
    const battle = g.__battleDebug as { overworldHud?: unknown } | undefined;
    if (battle && (battle as { overworldHud?: unknown }).overworldHud === undefined) out.scene = "battle";
  } catch { /* ignore */ }
  try {
    if (typeof g.__farmDebug === "function") out.farm = (g.__farmDebug as () => unknown)();
  } catch { /* ignore */ }
  try {
    out.url = location.href;
  } catch { /* ignore */ }
  return out;
}

function captureSave(): string | null {
  try {
    return localStorage.getItem("swagbound:save:0");
  } catch {
    return null;
  }
}

function captureScreenshot(): string | null {
  try {
    const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
    return canvas ? canvas.toDataURL("image/jpeg", 0.6) : null;
  } catch {
    return null;
  }
}

function buildStamp(): string {
  const g = globalThis as { __BUILD_STAMP__?: string };
  return g.__BUILD_STAMP__ ?? "?";
}

export class BugReporter {
  private open = false;
  private panel: HTMLElement | undefined;

  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (event.code !== "KeyN" || this.open) return;
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    // Ignore if another modal/menu already owns the keyboard visibly.
    event.preventDefault();
    event.stopPropagation();
    this.openReporter();
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler, true);
    }
  }

  private close(): void {
    this.open = false;
    this.panel?.remove();
    this.panel = undefined;
  }

  private openReporter(): void {
    this.open = true;
    const savedName = (() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } })();
    const panel = document.createElement("div");
    panel.id = "bug-reporter";
    panel.style.cssText =
      "position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;" +
      `background:rgba(0,0,0,0.6);font-family:${FONT};image-rendering:pixelated`;
    panel.innerHTML = `
      <div style="width:460px;max-width:92vw;background:#101010;border:2px solid #fff;
        box-shadow:inset 0 0 0 2px #101010,inset 0 0 0 3px #585868;padding:16px;color:#EEF1F6;font-size:15px;line-height:1.5">
        <div style="font-size:17px;margin-bottom:4px">Leave a bug report</div>
        <div style="color:#9AA3B2;font-size:12.5px;margin-bottom:10px">Your save, position, and a screenshot are attached automatically.</div>
        <input id="bug-name" placeholder="Your name" value="${savedName.replace(/"/g, "&quot;")}"
          style="width:100%;box-sizing:border-box;background:#1c1c1c;border:1px solid #585868;color:#EEF1F6;
          font-family:${FONT};font-size:14px;padding:6px 8px;margin-bottom:8px"/>
        <textarea id="bug-note" rows="5" placeholder="What happened? What did you expect?"
          style="width:100%;box-sizing:border-box;background:#1c1c1c;border:1px solid #585868;color:#EEF1F6;
          font-family:${FONT};font-size:14px;padding:6px 8px;resize:vertical"></textarea>
        <div id="bug-status" style="color:#e6bd54;font-size:13px;min-height:18px;margin-top:6px"></div>
        <div style="display:flex;gap:10px;margin-top:10px;justify-content:flex-end">
          <button id="bug-cancel" style="font-family:${FONT};font-size:14px;background:transparent;color:#9AA3B2;
            border:2px solid #585868;padding:5px 14px;cursor:pointer">Cancel (Esc)</button>
          <button id="bug-send" style="font-family:${FONT};font-size:14px;background:#EEF1F6;color:#0a0a0a;
            border:2px solid #fff;padding:5px 16px;cursor:pointer">Send</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    this.panel = panel;

    const note = panel.querySelector<HTMLTextAreaElement>("#bug-note");
    const nameEl = panel.querySelector<HTMLInputElement>("#bug-name");
    const status = panel.querySelector<HTMLDivElement>("#bug-status");
    const send = panel.querySelector<HTMLButtonElement>("#bug-send");
    const cancel = panel.querySelector<HTMLButtonElement>("#bug-cancel");
    setTimeout(() => note?.focus(), 30);

    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") { panel.removeEventListener("keydown", onKey, true); this.close(); }
    };
    panel.addEventListener("keydown", onKey, true);
    cancel?.addEventListener("click", () => this.close());
    send?.addEventListener("click", () => void this.submit(note, nameEl, status, send));
  }

  private async submit(
    note: HTMLTextAreaElement | null,
    nameEl: HTMLInputElement | null,
    status: HTMLDivElement | null,
    send: HTMLButtonElement | null
  ): Promise<void> {
    const text = note?.value.trim() ?? "";
    if (!text) { if (status) status.textContent = "Please describe the bug first."; return; }
    const reporter = nameEl?.value.trim() ?? "";
    try { if (reporter) localStorage.setItem(NAME_KEY, reporter); } catch { /* ignore */ }
    if (send) { send.disabled = true; send.textContent = "Sending..."; }
    if (status) status.textContent = "Bundling your save and a screenshot...";
    const payload = {
      note: text,
      reporter,
      build: buildStamp(),
      context: captureContext(),
      save: captureSave(),
      screenshot: captureScreenshot()
    };
    try {
      const res = await fetch("/api/bug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(String(res.status));
      if (status) status.textContent = "Sent. Thank you! Press Esc to close.";
      if (send) send.textContent = "Sent";
      setTimeout(() => this.close(), 1400);
    } catch {
      // Fallback: download the report so nothing is lost.
      this.downloadReport(payload);
      if (status) status.textContent = "Could not reach the server. Report downloaded; send Nick the file.";
      if (send) { send.disabled = false; send.textContent = "Send"; }
    }
  }

  private downloadReport(payload: Record<string, unknown>): void {
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `swagbound-bug-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { /* ignore */ }
  }
}

let started = false;
export function initBugReporter(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  new BugReporter();
}
