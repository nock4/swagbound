/**
 * Sidequest journal. Press J in the overworld to see your quests and their
 * step-by-step progress, read live from the story-flag system — a step is done
 * the moment its gating flag is set, so the journal always reflects real state.
 *
 * Quests are authored as flag checklists; no new progression machinery, just a
 * readable view over the flags the trigger/dialogue systems already set.
 */
export type QuestStep = { text: string; flag: string };
export type Quest = { id: string; name: string; blurb: string; steps: QuestStep[]; reward?: string };

export interface QuestJournalHost {
  quests(): Quest[];
  hasFlag(flag: string): boolean;
  objective?(): string | undefined;
  canOpen(): boolean;
}

export function isJournalKey(code: string): boolean {
  return code === "KeyJ";
}

export class QuestJournal {
  private static current: QuestJournal | undefined;
  private open = false;
  private panel: HTMLElement | undefined;
  private readonly keyHandler = (event: KeyboardEvent): void => {
    if (!this.open) {
      if (isJournalKey(event.code) && this.host.canOpen()) {
        this.open = true;
        this.render();
        event.preventDefault();
      }
      return;
    }
    if (event.code === "KeyX" || event.code === "Escape" || isJournalKey(event.code)) {
      this.close();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  constructor(private readonly host: QuestJournalHost) {
    QuestJournal.current?.destroy();
    QuestJournal.current = this;
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler, true);
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Open programmatically (e.g. from the command-menu Journal tile). Caller owns the gating. */
  openOverlay(): void {
    if (!this.open) {
      this.open = true;
      this.render();
    }
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyHandler, true);
    }
    this.panel?.remove();
    this.panel = undefined;
    if (QuestJournal.current === this) {
      QuestJournal.current = undefined;
    }
  }

  private close(): void {
    this.open = false;
    this.panel?.remove();
    this.panel = undefined;
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
        font: "13px/1.55 ui-monospace, Menlo, Consolas, monospace",
        color: "#f4f4f4",
        background: "rgba(14,14,22,0.96)",
        border: "2px solid #8ad0a0",
        borderRadius: "8px",
        padding: "12px 16px",
        maxWidth: "340px",
        pointerEvents: "none",
        textShadow: "0 1px 0 #000"
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(panel);
      this.panel = panel;
    }
    const quests = this.host.quests();
    const objective = this.host.objective?.()?.trim();
    const objectiveBlock = objective
      ? `<div style="margin-bottom:10px;padding:7px 9px;border:1px solid #ffd23f;color:#fff3b0;">` +
        `<span style="color:#ffd23f;font-weight:bold;">NEXT</span><br>${escapeHtml(objective)}</div>`
      : "";
    const blocks = quests.map((quest) => {
      const done = quest.steps.filter((s) => this.host.hasFlag(s.flag)).length;
      const complete = done === quest.steps.length;
      const started = done > 0;
      const header = complete
        ? `<span style="color:#8ad0a0;">✓ ${quest.name} — done</span>`
        : started
          ? `<span style="color:#ffd23f;">◈ ${quest.name} (${done}/${quest.steps.length})</span>`
          : `<span style="color:#8a86a0;">◇ ${quest.name}</span>`;
      const stepLines = quest.steps
        .map((s) => {
          const got = this.host.hasFlag(s.flag);
          return `<div style="padding-left:12px;color:${got ? "#cfe8d4" : "#8a86a0"};">${got ? "☑" : "☐"} ${s.text}</div>`;
        })
        .join("");
      const reward = quest.reward && complete ? `<div style="padding-left:12px;color:#ffd23f;">★ ${quest.reward}</div>` : "";
      const blurb = `<div style="padding-left:12px;color:#9a94b8;font-size:11px;">${quest.blurb}</div>`;
      return `<div style="margin-bottom:8px;">${header}${blurb}${stepLines}${reward}</div>`;
    });
    this.panel.innerHTML =
      `<div style="font-size:13px;margin-bottom:8px;">📓 Quest Journal</div>` +
      objectiveBlock +
      (blocks.length > 0 ? blocks.join("") : `<div style="color:#8a86a0;">No quests yet.</div>`) +
      `<div style="font-size:11px;margin-top:4px;color:#8a86a0;">J / X close</div>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
