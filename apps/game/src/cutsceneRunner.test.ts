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
  moveTimeoutMs = 2000;
  positions = new Map<string, { x: number; y: number }>();

  startActorMove(actor: EventActorMoveSelector, to: { x: number; y: number }, run: boolean): boolean {
    this.log.push(`move:${sel(actor)}->${to.x},${to.y}${run ? ":run" : ""}`);
    if (this.moveStartResult) this.moveActive = true;
    return this.moveStartResult;
  }
  isActorMoveActive(): boolean {
    return this.moveActive;
  }
  currentActorMoveTimeoutMs(): number {
    return this.moveTimeoutMs;
  }
  timeoutActorMove(actor: EventActorMoveSelector, to: { x: number; y: number }, elapsedMs: number, timeoutMs: number): void {
    this.log.push(`timeout:${sel(actor)}->${to.x},${to.y}:${Math.round(elapsedMs)}/${Math.round(timeoutMs)}`);
    this.moveActive = false;
    this.positions.set(sel(actor), to);
  }
  actorPosition(actor: EventActorMoveSelector): { x: number; y: number } | undefined {
    return this.positions.get(sel(actor));
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
  cutsceneMusic(action: "play" | "stop", cue: string | undefined, fadeMs: number | undefined): void {
    this.log.push(`music:${action}:${cue ?? "-"}:${fadeMs ?? "-"}`);
  }
  cutsceneCamera(
    action: "focus" | "pan" | "follow" | "shake",
    to: { x: number; y: number } | undefined,
    actor: EventActorMoveSelector | undefined,
    ms: number | undefined,
    zoom: number | undefined,
    intensity: number | undefined
  ): void {
    const target = to ? `${to.x},${to.y}` : actor ? sel(actor) : "-";
    this.log.push(`camera:${action}:${target}:${ms ?? "-"}:${zoom ?? "-"}:${intensity ?? "-"}`);
  }
  cutsceneFx(
    action: "fadeOut" | "fadeIn" | "flash" | "tint" | "clearTint",
    color: string | undefined,
    ms: number | undefined,
    alpha: number | undefined
  ): void {
    this.log.push(`fx:${action}:${color ?? "-"}:${ms ?? "-"}:${alpha ?? "-"}`);
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

  it("dispatches non-verbal staging ops (music / camera / fx) instantaneously and in order", () => {
    const host = new MockHost();
    const steps: CutsceneStep[] = [
      { op: "music", action: "play", cue: "mixtape", fadeMs: 800 },
      { op: "camera", action: "pan", to: { x: 100, y: 200 }, ms: 600, zoom: 3 },
      { op: "fx", action: "flash", color: "#ffffff", ms: 120 },
      { op: "fx", action: "tint", color: "#f0c060", alpha: 0.3 },
      { op: "music", action: "stop", fadeMs: 400 },
      { op: "camera", action: "follow" }
    ];
    const runner = new CutsceneRunner(steps, host, () => {});
    expect(host.log).toEqual([
      "music:play:mixtape:800",
      "camera:pan:100,200:600:3:-",
      "fx:flash:#ffffff:120:-",
      "fx:tint:#f0c060:-:0.3",
      "music:stop:-:400",
      "camera:follow:-:-:-:-"
    ]);
    expect(runner.running).toBe(false);
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

  it("aborts through terminal state effects and the completion callback once", () => {
    const host = new MockHost();
    let completed = 0;
    const steps: CutsceneStep[] = [
      { op: "dialogue", pages: ["Holding"] },
      { op: "hideActor", actor: npc(8) },
      { op: "setFlag", flag: "after" },
      { op: "eventFlag", flag: 289, set: true },
      { op: "moveActor", actor: npc(9), to: { x: 5, y: 6 } },
      { op: "sound", id: "doorOpen" }
    ];
    const runner = new CutsceneRunner(steps, host, () => { completed += 1; });

    expect(runner.running).toBe(true);
    runner.abort();
    runner.abort();

    expect(runner.running).toBe(false);
    expect(completed).toBe(1);
    expect(host.log).toEqual(["dialogue:Holding", "hide:npc8", "setFlag:after", "eventFlag:289:set"]);
  });

  it("times out a stuck moveActor, snaps it, and continues", () => {
    const host = new MockHost();
    host.moveTimeoutMs = 2000;
    const steps: CutsceneStep[] = [
      { op: "moveActor", actor: npc(7), to: { x: 90, y: 0 } },
      { op: "setFlag", flag: "done" }
    ];
    const runner = new CutsceneRunner(steps, host);

    expect(host.log).toEqual(["move:npc7->90,0"]);
    runner.update(1999);
    expect(runner.running).toBe(true);
    expect(host.log).toEqual(["move:npc7->90,0"]);
    runner.update(1);

    expect(host.log).toEqual(["move:npc7->90,0", "timeout:npc7->90,0:2000/2000", "setFlag:done"]);
    expect(host.positions.get("npc7")).toEqual({ x: 90, y: 0 });
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
