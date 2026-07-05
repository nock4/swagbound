import { describe, expect, it } from "vitest";
import {
  DIR_REPEAT_DELAY_MS,
  DIR_REPEAT_INTERVAL_MS,
  GamepadTracker,
  SNES_BUTTON_ACTIONS,
  directionToDelta,
  directionToKeyCode,
  gamepadButtonStates,
  gamepadDirections,
  pickActiveGamepad
} from "./gamepadInput";

function pad(pressedIndexes: number[] = [], axes: number[] = [0, 0, 0, 0]) {
  return {
    buttons: Array.from({ length: 17 }, (_unused, index) => ({ pressed: pressedIndexes.includes(index) })),
    axes
  };
}

describe("gamepadInput button map", () => {
  it("maps the SNES face + system buttons EarthBound-faithfully", () => {
    expect(SNES_BUTTON_ACTIONS[1]).toBe("confirm"); // A / right face
    expect(SNES_BUTTON_ACTIONS[0]).toBe("cancel"); // B / bottom face
    expect(SNES_BUTTON_ACTIONS[3]).toBe("map"); // X / top face
    expect(SNES_BUTTON_ACTIONS[2]).toBe("bike"); // Y / left face
    expect(SNES_BUTTON_ACTIONS[9]).toBe("menu"); // Start
    expect(SNES_BUTTON_ACTIONS[8]).toBe("save"); // Select
    expect(SNES_BUTTON_ACTIONS[4]).toBe("partyPrev"); // L
    expect(SNES_BUTTON_ACTIONS[5]).toBe("partyNext"); // R
  });
});

describe("gamepadDirections", () => {
  it("reads the d-pad buttons", () => {
    expect(gamepadDirections(pad([12]))).toMatchObject({ up: true, down: false });
    expect(gamepadDirections(pad([13, 15]))).toMatchObject({ down: true, right: true, up: false, left: false });
  });

  it("reads the left stick past the deadzone only", () => {
    expect(gamepadDirections(pad([], [0.2, -0.2]))).toEqual({ up: false, down: false, left: false, right: false });
    expect(gamepadDirections(pad([], [-0.8, 0.9]))).toMatchObject({ left: true, down: true });
  });
});

describe("GamepadTracker edges", () => {
  it("fires a button action once on the press edge, not while held", () => {
    const tracker = new GamepadTracker();
    // first frame with A held -> confirm edge
    expect(tracker.tick(gamepadButtonStates(pad([1])), gamepadDirections(pad()), 0).pressedActions).toEqual(["confirm"]);
    // still held -> no repeat
    expect(tracker.tick(gamepadButtonStates(pad([1])), gamepadDirections(pad()), 16).pressedActions).toEqual([]);
    // released
    expect(tracker.tick(gamepadButtonStates(pad()), gamepadDirections(pad()), 32).pressedActions).toEqual([]);
    // pressed again -> new edge
    expect(tracker.tick(gamepadButtonStates(pad([1])), gamepadDirections(pad()), 48).pressedActions).toEqual(["confirm"]);
  });

  it("repeats a held direction after the delay, then at the interval", () => {
    const tracker = new GamepadTracker();
    const down = () => ({ buttons: gamepadButtonStates(pad([13])), dirs: gamepadDirections(pad([13])) });
    let t = 0;
    const first = tracker.tick(down().buttons, down().dirs, t);
    expect(first.directionEdges).toEqual(["down"]); // initial tap
    // before the repeat delay: nothing
    t += DIR_REPEAT_DELAY_MS - 10;
    expect(tracker.tick(down().buttons, down().dirs, t).directionEdges).toEqual([]);
    // past the delay: one repeat
    t += 20;
    expect(tracker.tick(down().buttons, down().dirs, t).directionEdges).toEqual(["down"]);
    // then at the interval
    t += DIR_REPEAT_INTERVAL_MS + 1;
    expect(tracker.tick(down().buttons, down().dirs, t).directionEdges).toEqual(["down"]);
  });

  it("resets the repeat clock when the direction is released", () => {
    const tracker = new GamepadTracker();
    expect(tracker.tick(gamepadButtonStates(pad([13])), gamepadDirections(pad([13])), 0).directionEdges).toEqual(["down"]);
    // release
    tracker.tick(gamepadButtonStates(pad()), gamepadDirections(pad()), 50);
    // re-press well before any interval -> a fresh initial tap, not a swallow
    expect(tracker.tick(gamepadButtonStates(pad([13])), gamepadDirections(pad([13])), 60).directionEdges).toEqual(["down"]);
  });
});

describe("gamepad helpers", () => {
  it("picks the first connected pad", () => {
    const p = pad([1]);
    expect(pickActiveGamepad([null, null, p])).toBe(p);
    expect(pickActiveGamepad([null, null])).toBeUndefined();
  });

  it("maps directions to menu deltas and DOM key codes", () => {
    expect(directionToDelta("up")).toEqual({ dx: 0, dy: -1 });
    expect(directionToDelta("right")).toEqual({ dx: 1, dy: 0 });
    expect(directionToKeyCode("down")).toBe("ArrowDown");
    expect(directionToKeyCode("left")).toBe("ArrowLeft");
  });
});
