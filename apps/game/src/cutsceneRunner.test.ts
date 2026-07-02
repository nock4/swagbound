import { describe, expect, it } from "vitest";
import type { CutsceneStep, EventActorMoveSelector } from "@eb/schemas";
import { CutsceneRunner, type CutsceneFacing, type CutsceneHost } from "./cutsceneRunner";
import type { CutsceneSoundId } from "./cutsceneSfx";

function sel(actor: EventActorMoveSelector): string {
  if (actor === "player") return "player";
  if ("kind" in actor && actor.kind === "player") return "player";
  if ("npcId" in actor) return `npc${actor.npcId}`;
  return "?";
}

class MockHost implements CutsceneHost {
  log: string[] = [];
  moveActive = false;
  dialogueOpen = false;
  moveStartResult = true;

  startActorMove(actor: EventActorMoveSelector, to: { x: number; y: number }, run: boolean): boolean {
    this.log.push(`move:${sel(actor)}->${to.x},${to.y}${run ? ":run" : ""}`);
    if (this.moveStartResult) this.moveActive = true;
    return this.moveStartResult;
  }
  isActorMoveActive(): boolean {
    return this.moveActive;
  }
  faceActor(actor: EventActorMoveSelector, dir: CutsceneFacing): void {
    this.log.push(`face:${sel(actor)}:${dir}`);
  }
  setActorVisible(actor: EventActorMoveSelector, visible: boolean): void {
    this.log.push(`${visible ? "show" : "hide"}:${sel(actor)}`);
  }
  startDialogue(pages: readonly string[]): void {
    this.log.push(`dialogue:${pages.join("|")}`);
    this.dialogueOpen = true;
  }
  isDialogueOpen(): boolean {
    return this.dialogueOpen;
  }
  setGameFlag(flag: string): void {
    this.log.push(`setFlag:${flag}`);
  }
  clearGameFlag(flag: string): void {
    this.log.push(`clearFlag:${flag}`);
  }
  setEventFlag(flag: number, set: boolean): void {
    this.log.push(`eventFlag:${flag}:${set ? "set" : "unset"}`);
  }
  playSound(id: CutsceneSoundId): void {
    this.log.push(`sound:${id}`);
  }
  warp(to: { x: number; y: number }): void {
    this.log.push(`warp:${to.x},${to.y}`);
  }
}

const npc = (npcId: number): EventActorMoveSelector => ({ npcId });

describe("CutsceneRunner", () => {
  it("runs instantaneous steps in order and completes immediately", () => {
    const host = new MockHost();
    let completed = 0;
    const steps: CutsceneStep[] = [
      { op: "hideActor", actor: npc(1) },
      { op: "faceActor", actor: "player", dir: "up" },
      { op: "setFlag", flag: "cutscene:x" }
    ];
    const runner = new CutsceneRunner(steps, host, () => { completed += 1; });
    expect(host.log).toEqual(["hide:npc1", "face:player:up", "setFlag:cutscene:x"]);
    expect(runner.running).toBe(false);
    expect(completed).toBe(1);
  });

  it("blocks on wait until the duration elapses", () => {
    const host = new MockHost();
    const steps: CutsceneStep[] = [
      { op: "setFlag", flag: "a" },
      { op: "wait", ms: 100 },
      { op: "setFlag", flag: "b" }
    ];
    const runner = new CutsceneRunner(steps, host);
    expect(host.log).toEqual(["setFlag:a"]);
    runner.update(50);
    expect(host.log).toEqual(["setFlag:a"]);
    expect(runner.running).toBe(true);
    runner.update(60);
    expect(host.log).toEqual(["setFlag:a", "setFlag:b"]);
    expect(runner.running).toBe(false);
  });

  it("runs named sound cue steps", () => {
    const host = new MockHost();
    const steps: CutsceneStep[] = [
      { op: "sound", id: "doorOpen" },
      { op: "sound", id: 7 }
    ];
    const runner = new CutsceneRunner(steps, host);

    expect(host.log).toEqual(["sound:doorOpen", "sound:7"]);
    expect(runner.running).toBe(false);
  });

  it("blocks on moveActor until the move goes inactive", () => {
    const host = new MockHost();
    const steps: CutsceneStep[] = [
      { op: "moveActor", actor: npc(7), to: { x: 10, y: 20 }, run: true },
      { op: "setFlag", flag: "done" }
    ];
    const runner = new CutsceneRunner(steps, host);
    expect(host.log).toEqual(["move:npc7->10,20:run"]);
    runner.update(16);
    expect(runner.running).toBe(true); // still moving
    host.moveActive = false;
    runner.update(16);
    expect(host.log).toEqual(["move:npc7->10,20:run", "setFlag:done"]);
    expect(runner.running).toBe(false);
  });

  it("skips a moveActor that fails to start instead of soft-locking", () => {
    const host = new MockHost();
    host.moveStartResult = false;
    const steps: CutsceneStep[] = [
      { op: "moveActor", actor: npc(7), to: { x: 1, y: 2 } },
      { op: "setFlag", flag: "after" }
    ];
    const runner = new CutsceneRunner(steps, host);
    expect(host.log).toEqual(["move:npc7->1,2", "setFlag:after"]);
    expect(runner.running).toBe(false);
  });

  it("blocks on dialogue until it closes", () => {
    const host = new MockHost();
    const steps: CutsceneStep[] = [
      { op: "dialogue", pages: ["Hello", "World"] },
      { op: "setFlag", flag: "talked" }
    ];
    const runner = new CutsceneRunner(steps, host);
    expect(host.log).toEqual(["dialogue:Hello|World"]);
    runner.update(16);
    expect(runner.running).toBe(true);
    host.dialogueOpen = false;
    runner.update(16);
    expect(host.log).toEqual(["dialogue:Hello|World", "setFlag:talked"]);
    expect(runner.running).toBe(false);
  });

  it("runs a mixed sequence (hide -> move -> face -> dialogue) and completes once", () => {
    const host = new MockHost();
    let completed = 0;
    const steps: CutsceneStep[] = [
      { op: "hideActor", actor: npc(73) },
      { op: "showActor", actor: npc(73) },
      { op: "moveActor", actor: npc(73), to: { x: 100, y: 50 } },
      { op: "faceActor", actor: npc(73), dir: "down" },
      { op: "dialogue", pages: ["..."] },
      { op: "setFlag", flag: "cutscene:police-done" }
    ];
    const runner = new CutsceneRunner(steps, host, () => { completed += 1; });
    // up to the move (blocking)
    expect(host.log).toEqual(["hide:npc73", "show:npc73", "move:npc73->100,50"]);
    host.moveActive = false;
    runner.update(16); // move done -> face (instant) -> dialogue (blocking)
    expect(host.log).toEqual(["hide:npc73", "show:npc73", "move:npc73->100,50", "face:npc73:down", "dialogue:..."]);
    host.dialogueOpen = false;
    runner.update(16); // dialogue closed -> setFlag -> done
    expect(host.log.at(-1)).toBe("setFlag:cutscene:police-done");
    expect(runner.running).toBe(false);
    expect(completed).toBe(1);
    runner.update(16); // no double-complete
    expect(completed).toBe(1);
  });
});
