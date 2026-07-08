import { describe, expect, it } from "vitest";
import { EventSequenceWatchdog, cutsceneRunnerProgressToken } from "./eventSequenceWatchdog";

describe("EventSequenceWatchdog", () => {
  it("terminates a running sequence after 2500ms without dialogue or progress", () => {
    const watchdog = new EventSequenceWatchdog(2500);

    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 1000,
      progressToken: "effects:3"
    })).toEqual({ timedOut: false, idleMs: 0 });

    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 3500,
      progressToken: "effects:3"
    })).toEqual({ timedOut: false, idleMs: 2500 });

    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 3501,
      progressToken: "effects:3"
    })).toEqual({ timedOut: true, idleMs: 2501 });
  });

  it("resets the idle timer on progress and dialogue transitions", () => {
    const watchdog = new EventSequenceWatchdog(2500);

    watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 0,
      progressToken: "effects:1"
    });
    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 2400,
      progressToken: "effects:2"
    })).toEqual({ timedOut: false, idleMs: 0 });
    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 4800,
      progressToken: "effects:2"
    })).toEqual({ timedOut: false, idleMs: 2400 });

    expect(watchdog.update({
      running: true,
      dialogueOpen: true,
      nowMs: 6000,
      progressToken: "effects:2"
    })).toEqual({ timedOut: false, idleMs: 0 });
    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 7400,
      progressToken: "effects:2"
    })).toEqual({ timedOut: false, idleMs: 0 });
    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 9901,
      progressToken: "effects:2"
    })).toEqual({ timedOut: true, idleMs: 2501 });
  });

  it("clears stale state after the sequence stops", () => {
    const watchdog = new EventSequenceWatchdog(2500);

    watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 0,
      progressToken: "old"
    });
    expect(watchdog.update({
      running: false,
      dialogueOpen: false,
      nowMs: 5000,
      progressToken: "old"
    })).toEqual({ timedOut: false, idleMs: 0 });
    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 6000,
      progressToken: "new"
    })).toEqual({ timedOut: false, idleMs: 0 });
  });

  it("uses only cutscene runner index and dialogue transitions for cutscene progress", () => {
    const watchdog = new EventSequenceWatchdog(2500);
    const token = cutsceneRunnerProgressToken({
      cutsceneId: "onett-police-disperse",
      stepIndex: 4,
      dialogueOpen: false,
      dialogueOpens: 1,
      dialogueCloses: 1
    });

    expect(token).toBe("onett-police-disperse|4|dialogue-closed|1|1");
    watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 0,
      progressToken: token
    });

    // Actor pixel positions are deliberately not part of the token; a jittering
    // actor at the same runner step must not reset the idle timer.
    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 2501,
      progressToken: token
    })).toEqual({ timedOut: true, idleMs: 2501 });

    expect(watchdog.update({
      running: true,
      dialogueOpen: false,
      nowMs: 2502,
      progressToken: cutsceneRunnerProgressToken({
        cutsceneId: "onett-police-disperse",
        stepIndex: 5,
        dialogueOpen: false,
        dialogueOpens: 1,
        dialogueCloses: 1
      })
    })).toEqual({ timedOut: false, idleMs: 0 });
  });
});
