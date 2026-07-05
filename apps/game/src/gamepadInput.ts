/**
 * SNES-style gamepad support for the overworld. Pure + testable: the scene polls
 * navigator.getGamepads() each frame, hands the raw button/axis snapshot here, and
 * this module reports edge-pressed actions + directional taps (with hold-to-repeat)
 * and the held direction vector for continuous movement. No DOM, no Phaser, no time
 * source of its own — the caller passes `nowMs`.
 *
 * Button map follows the W3C "standard" gamepad layout, which is how browsers
 * normalize SNES-style USB pads. Face-button roles are EarthBound-faithful: the
 * right face (A) confirms, the bottom face (B) cancels.
 */
export type GamepadAction =
  | "confirm"   // A / right face
  | "cancel"    // B / bottom face
  | "menu"      // Start — open/close the command menu
  | "save"      // Select
  | "bike"      // Y / left face
  | "map"       // X / top face — PSI Teleport map
  | "partyPrev" // L — rotate party lead backward
  | "partyNext"; // R — rotate party lead forward

/** Standard-mapping button index -> action. */
export const SNES_BUTTON_ACTIONS: Readonly<Record<number, GamepadAction>> = {
  1: "confirm",
  0: "cancel",
  3: "map",
  2: "bike",
  9: "menu",
  8: "save",
  4: "partyPrev",
  5: "partyNext"
};

export type GamepadDirection = "up" | "down" | "left" | "right";
export const GAMEPAD_DIRECTIONS: readonly GamepadDirection[] = ["up", "down", "left", "right"];

export type DirectionVector = { up: boolean; down: boolean; left: boolean; right: boolean };

/** Left-stick deadzone before an axis counts as a direction. */
export const AXIS_DEADZONE = 0.5;
/** Delay before a held direction starts auto-repeating (menu cursor), and the repeat gap. */
export const DIR_REPEAT_DELAY_MS = 260;
export const DIR_REPEAT_INTERVAL_MS = 130;

type GamepadLike = {
  buttons: ReadonlyArray<{ pressed: boolean }>;
  axes: ReadonlyArray<number>;
};

export function gamepadButtonStates(pad: GamepadLike): boolean[] {
  return pad.buttons.map((button) => Boolean(button?.pressed));
}

export function gamepadDirections(pad: GamepadLike): DirectionVector {
  const axisX = pad.axes[0] ?? 0;
  const axisY = pad.axes[1] ?? 0;
  return {
    up: Boolean(pad.buttons[12]?.pressed) || axisY < -AXIS_DEADZONE,
    down: Boolean(pad.buttons[13]?.pressed) || axisY > AXIS_DEADZONE,
    left: Boolean(pad.buttons[14]?.pressed) || axisX < -AXIS_DEADZONE,
    right: Boolean(pad.buttons[15]?.pressed) || axisX > AXIS_DEADZONE
  };
}

export type GamepadFrame = {
  /** Buttons that transitioned unpressed -> pressed this tick. */
  pressedActions: GamepadAction[];
  /** Direction taps this tick (initial press + hold-to-repeat), for discrete menu nav. */
  directionEdges: GamepadDirection[];
  /** Held directions, for continuous field movement. */
  held: DirectionVector;
};

const NO_DIRECTION: DirectionVector = { up: false, down: false, left: false, right: false };

/**
 * Edge + repeat tracker. One instance per input owner; feed it a snapshot each frame.
 * Kept as a class (not free functions) only to hold the previous-frame state; the tick
 * logic itself is deterministic given (buttons, directions, nowMs).
 */
export class GamepadTracker {
  private prevButtons: boolean[] = [];
  private readonly repeatAt: Partial<Record<GamepadDirection, number>> = {};

  reset(): void {
    this.prevButtons = [];
    for (const dir of GAMEPAD_DIRECTIONS) {
      delete this.repeatAt[dir];
    }
  }

  tick(buttons: boolean[], directions: DirectionVector, nowMs: number): GamepadFrame {
    const pressedActions: GamepadAction[] = [];
    for (const [indexKey, action] of Object.entries(SNES_BUTTON_ACTIONS)) {
      const index = Number(indexKey);
      if (buttons[index] && !this.prevButtons[index]) {
        pressedActions.push(action);
      }
    }
    this.prevButtons = buttons.slice();

    const directionEdges: GamepadDirection[] = [];
    for (const dir of GAMEPAD_DIRECTIONS) {
      if (!directions[dir]) {
        delete this.repeatAt[dir];
        continue;
      }
      const nextFire = this.repeatAt[dir];
      if (nextFire === undefined) {
        directionEdges.push(dir);
        this.repeatAt[dir] = nowMs + DIR_REPEAT_DELAY_MS;
      } else if (nowMs >= nextFire) {
        directionEdges.push(dir);
        this.repeatAt[dir] = nowMs + DIR_REPEAT_INTERVAL_MS;
      }
    }

    return { pressedActions, directionEdges, held: directions };
  }
}

export function pickActiveGamepad(pads: ReadonlyArray<GamepadLike | null>): GamepadLike | undefined {
  for (const pad of pads) {
    if (pad) {
      return pad;
    }
  }
  return undefined;
}

export const NO_HELD_DIRECTION = NO_DIRECTION;

/** Map a direction to a 2D menu-cursor delta (dx, dy). */
export function directionToDelta(dir: GamepadDirection): { dx: number; dy: number } {
  switch (dir) {
    case "up": return { dx: 0, dy: -1 };
    case "down": return { dx: 0, dy: 1 };
    case "left": return { dx: -1, dy: 0 };
    case "right": return { dx: 1, dy: 0 };
  }
}

/** DOM KeyboardEvent.code a direction maps to, for driving the DOM overlays. */
export function directionToKeyCode(dir: GamepadDirection): string {
  switch (dir) {
    case "up": return "ArrowUp";
    case "down": return "ArrowDown";
    case "left": return "ArrowLeft";
    case "right": return "ArrowRight";
  }
}
