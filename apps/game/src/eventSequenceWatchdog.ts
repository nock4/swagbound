export type EventSequenceWatchdogInput = {
  running: boolean;
  dialogueOpen: boolean;
  choiceOpen?: boolean;
  nowMs: number;
  progressToken: string;
};

export type EventSequenceWatchdogResult = {
  timedOut: boolean;
  idleMs: number;
};

export type CutsceneRunnerProgressTokenInput = {
  cutsceneId: string | undefined;
  stepIndex: number | undefined;
  dialogueOpen: boolean;
  dialogueOpens: number;
  dialogueCloses: number;
};

export function cutsceneRunnerProgressToken(input: CutsceneRunnerProgressTokenInput): string {
  return [
    input.cutsceneId ?? "unknown",
    input.stepIndex ?? "none",
    input.dialogueOpen ? "dialogue-open" : "dialogue-closed",
    input.dialogueOpens,
    input.dialogueCloses
  ].join("|");
}

export class EventSequenceWatchdog {
  private lastProgressAtMs: number | undefined;
  private lastProgressToken: string | undefined;
  private lastDialogueOpen: boolean | undefined;
  private lastChoiceOpen: boolean | undefined;

  constructor(private readonly timeoutMs: number) {}

  update(input: EventSequenceWatchdogInput): EventSequenceWatchdogResult {
    if (!input.running) {
      this.reset();
      return { timedOut: false, idleMs: 0 };
    }

    if (this.hasProgress(input)) {
      this.lastProgressAtMs = input.nowMs;
      this.lastProgressToken = input.progressToken;
      this.lastDialogueOpen = input.dialogueOpen;
      this.lastChoiceOpen = Boolean(input.choiceOpen);
    }

    if (input.dialogueOpen || input.choiceOpen) {
      return { timedOut: false, idleMs: 0 };
    }

    const lastProgressAtMs = this.lastProgressAtMs ?? input.nowMs;
    const idleMs = Math.max(0, input.nowMs - lastProgressAtMs);
    return { timedOut: idleMs > this.timeoutMs, idleMs };
  }

  reset(): void {
    this.lastProgressAtMs = undefined;
    this.lastProgressToken = undefined;
    this.lastDialogueOpen = undefined;
    this.lastChoiceOpen = undefined;
  }

  private hasProgress(input: EventSequenceWatchdogInput): boolean {
    return this.lastProgressAtMs === undefined
      || input.progressToken !== this.lastProgressToken
      || input.dialogueOpen !== this.lastDialogueOpen
      || Boolean(input.choiceOpen) !== this.lastChoiceOpen;
  }
}
