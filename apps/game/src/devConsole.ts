/**
 * Dev Console - the hub for dev-mode tooling, toggled with the backtick (`) key.
 * Dev-server only (mounted from the scene under import.meta.env.DEV). A window-listener
 * singleton like the other overlays, so a scene restart can't strand a second copy.
 *
 * Shows live state (player + mouse world coords, sector/area/town) and hosts the tool
 * toggles: Track Lab (L), annotate mode + dialogue tagging (N), click-to-warp (shift-click),
 * encounters on/off, instant-win, force-encounter. Notes are captured through an inline
 * input and posted to tmp/dev-notes.md (see devNotes.ts).
 */
export type DevLiveState = {
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  sector: number | null;
  area: number | null;
  town: string | null;
  facing: string;
  bike: boolean;
  mouseX: number | null;
  mouseY: number | null;
  lines?: string[];
};

export interface DevConsoleHost {
  liveState(): DevLiveState;
  trackLabVisible?(): boolean;
  toggleTrackLab?(): void;
  annotateMode?(): boolean;
  toggleAnnotate?(): void;
  noteActionLabel?(): string;
  captureSceneNote?(): void;
  encountersEnabled?(): boolean;
  toggleEncounters?(): void;
  instantWin?(): boolean;
  toggleInstantWin?(): void;
  forceEncounter?(group: number): void;
  dialogueOpen?(): boolean;
  captureDialogueNote?(): void;
  noteCount(): number;
  footerHint?(): string;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
};

export class DevConsole {
  private static current: DevConsole | undefined;
  private open = false;
  private panel: HTMLElement | undefined;
  private noteInput: HTMLInputElement | undefined;
  private noteRow: HTMLElement | undefined;
  private noteSubmit: ((text: string) => void) | undefined;
  private refreshTimer: number | undefined;

  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) {
      event.stopImmediatePropagation();
      // While typing a note: Enter submits, Escape cancels; everything else is literal.
      if (this.noteSubmit && event.code === "Enter") {
        this.commitNote();
        event.preventDefault();
      } else if (this.noteSubmit && event.code === "Escape") {
        this.cancelNote();
        event.preventDefault();
      }
      return;
    }
    if (this.open) {
      event.stopImmediatePropagation();
    }
    switch (event.code) {
      case "Backquote":
        this.setOpen(!this.open);
        break;
      case "KeyL":
        if (!this.host.toggleTrackLab) {
          if (this.open) {
            event.preventDefault();
          }
          return;
        }
        this.host.toggleTrackLab();
        this.render();
        break;
      case "KeyN":
        this.activateNoteTool();
        break;
      default:
        if (this.open) {
          event.preventDefault();
        }
        return;
    }
    event.stopImmediatePropagation();
    event.preventDefault();
  };

  constructor(private readonly host: DevConsoleHost) {
    DevConsole.current?.destroy();
    DevConsole.current = this;
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
    if (this.refreshTimer !== undefined) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.panel?.remove();
    this.panel = undefined;
    if (DevConsole.current === this) {
      DevConsole.current = undefined;
    }
  }

  /** Open an inline note-capture input; onSubmit fires with the typed text on Enter. */
  beginNoteCapture(label: string, onSubmit: (text: string) => void): void {
    this.noteSubmit = onSubmit;
    this.setOpen(true);
    this.render();
    if (this.noteRow) {
      this.noteRow.style.display = "";
      const hint = this.noteRow.querySelector(".devc-note-label");
      if (hint) {
        hint.textContent = label;
      }
    }
    this.noteInput?.focus();
  }

  private commitNote(): void {
    const submit = this.noteSubmit;
    const text = this.noteInput?.value ?? "";
    this.cancelNote();
    submit?.(text);
    this.render();
  }

  private cancelNote(): void {
    this.noteSubmit = undefined;
    if (this.noteInput) {
      this.noteInput.value = "";
      this.noteInput.blur();
    }
    if (this.noteRow) {
      this.noteRow.style.display = "none";
    }
  }

  private activateNoteTool(): void {
    if (this.host.dialogueOpen?.()) {
      this.host.captureDialogueNote?.();
      return;
    }
    if (this.host.captureSceneNote) {
      this.host.captureSceneNote();
      return;
    }
    this.host.toggleAnnotate?.();
    this.setOpen(true);
  }

  private setOpen(open: boolean): void {
    this.open = open;
    if (open) {
      this.render();
      if (this.refreshTimer === undefined && typeof window !== "undefined") {
        this.refreshTimer = window.setInterval(() => {
          if (this.open) {
            this.renderState();
          }
        }, 120);
      }
    } else {
      this.cancelNote();
      if (this.refreshTimer !== undefined) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = undefined;
      }
      this.panel?.remove();
      this.panel = undefined;
    }
  }

  private ensurePanel(): void {
    if (this.panel || typeof document === "undefined") {
      return;
    }
    const panel = document.createElement("div");
    panel.className = "devc-root";
    Object.assign(panel.style, {
      position: "fixed",
      top: "12px",
      left: "12px",
      zIndex: "100000",
      width: "268px",
      font: "12px/1.5 ui-monospace, Menlo, Consolas, monospace",
      color: "#e8e8f0",
      background: "rgba(12,12,20,0.94)",
      border: "2px solid #6ad0ff",
      borderRadius: "8px",
      padding: "10px 12px",
      textShadow: "0 1px 0 #000"
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(panel);
    this.panel = panel;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      all: "unset", cursor: "pointer", fontSize: "11px", padding: "2px 7px",
      margin: "1px 3px 1px 0", borderRadius: "5px", border: "1px solid #3a4356", color: "#dfe6f2"
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener("click", () => {
      onClick();
      this.render();
      if (this.noteSubmit) {
        this.noteInput?.focus();
      }
    });
    return btn;
  }

  private render(): void {
    if (!this.open) {
      return;
    }
    this.ensurePanel();
    const panel = this.panel;
    if (!panel) {
      return;
    }
    panel.textContent = "";

    const title = document.createElement("div");
    title.textContent = "⚙ Dev Console";
    Object.assign(title.style, { fontSize: "13px", marginBottom: "6px", color: "#6ad0ff" });
    panel.appendChild(title);

    const state = document.createElement("div");
    state.className = "devc-state";
    Object.assign(state.style, { whiteSpace: "pre", color: "#b9c2d6", marginBottom: "8px" });
    panel.appendChild(state);

    const tools = document.createElement("div");
    const pill = (on: boolean) => (on ? "●" : "○");
    if (this.host.toggleTrackLab && this.host.trackLabVisible) {
      tools.appendChild(this.button(`${pill(this.host.trackLabVisible())} Track Lab [L]`, () => this.host.toggleTrackLab?.()));
    }
    if (this.host.captureSceneNote || this.host.toggleAnnotate) {
      const label = this.host.noteActionLabel?.() ?? "Annotate [N]";
      tools.appendChild(this.button(`${pill(this.host.annotateMode?.() ?? false)} ${label}`, () => this.activateNoteTool()));
    }
    if (this.host.toggleEncounters && this.host.encountersEnabled) {
      tools.appendChild(this.button(`${pill(this.host.encountersEnabled())} Encounters`, () => this.host.toggleEncounters?.()));
    }
    if (this.host.toggleInstantWin && this.host.instantWin) {
      tools.appendChild(this.button(`${pill(this.host.instantWin())} Instant-win`, () => this.host.toggleInstantWin?.()));
    }
    panel.appendChild(tools);

    if (this.host.forceEncounter) {
      const forceRow = document.createElement("div");
      Object.assign(forceRow.style, { display: "flex", gap: "4px", alignItems: "center", margin: "6px 0" });
      const groupInput = document.createElement("input");
      groupInput.type = "number";
      groupInput.placeholder = "group";
      Object.assign(groupInput.style, {
        width: "58px", fontSize: "11px", padding: "2px 4px", borderRadius: "4px",
        border: "1px solid #3a4356", background: "#171b26", color: "#e8e8f0"
      } satisfies Partial<CSSStyleDeclaration>);
      const forceBtn = this.button("Force encounter", () => {
        const group = Number.parseInt(groupInput.value, 10);
        if (Number.isFinite(group)) {
          this.host.forceEncounter?.(group);
        }
      });
      forceRow.append(groupInput, forceBtn);
      panel.appendChild(forceRow);
    }

    // Note capture row (hidden until a pin/dialogue capture starts).
    const noteRow = document.createElement("div");
    noteRow.style.display = this.noteSubmit ? "" : "none";
    Object.assign(noteRow.style, { marginTop: "4px" });
    const noteLabel = document.createElement("div");
    noteLabel.className = "devc-note-label";
    Object.assign(noteLabel.style, { color: "#ffd23f", fontSize: "11px", marginBottom: "2px" });
    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.placeholder = "note… (Enter to send, Esc cancel)";
    Object.assign(noteInput.style, {
      width: "100%", boxSizing: "border-box", fontSize: "11px", padding: "3px 5px",
      borderRadius: "4px", border: "1px solid #ffd23f", background: "#171b26", color: "#e8e8f0"
    } satisfies Partial<CSSStyleDeclaration>);
    noteRow.append(noteLabel, noteInput);
    panel.appendChild(noteRow);
    this.noteRow = noteRow;
    this.noteInput = noteInput;

    const footer = document.createElement("div");
    Object.assign(footer.style, { marginTop: "6px", color: "#7c869c", fontSize: "11px" });
    const hint = this.host.footerHint?.() ?? "shift-click: warp";
    footer.textContent = `${hint} · notes: ${this.host.noteCount()} → tmp/dev-notes.md · \` close`;
    panel.appendChild(footer);

    this.renderState();
  }

  private renderState(): void {
    const stateEl = this.panel?.querySelector(".devc-state");
    if (!stateEl) {
      return;
    }
    const s = this.host.liveState();
    if (s.lines?.length) {
      stateEl.textContent = s.lines.join("\n");
      return;
    }
    const mouse = s.mouseX !== null && s.mouseY !== null ? `${Math.round(s.mouseX)},${Math.round(s.mouseY)}` : "none";
    stateEl.textContent =
      `player ${Math.round(s.x)},${Math.round(s.y)}  (tile ${s.tileX},${s.tileY})\n` +
      `mouse  ${mouse}\n` +
      `sector ${s.sector ?? "?"} · area ${s.area ?? "?"} · ${s.town ?? "?"}\n` +
      `facing ${s.facing}${s.bike ? " · bike" : ""}`;
  }
}
