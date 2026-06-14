import { describe, expect, it } from "vitest";
import {
  CANCEL_KEY_NAMES,
  CONFIRM_KEY_NAMES,
  inputActionForKeyName,
  registerDiscreteKeys,
  type KeyboardEventLike
} from "../src/inputModel";

class FakeKeyboard {
  private handlers = new Map<string, Array<(event?: KeyboardEventLike) => void>>();

  on(eventName: string, handler: (event?: KeyboardEventLike) => void): this {
    this.handlers.set(eventName, [...(this.handlers.get(eventName) ?? []), handler]);
    return this;
  }

  emit(eventName: string, event?: KeyboardEventLike): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(event);
    }
  }
}

describe("input model", () => {
  it("maps Z and legacy aliases to confirm", () => {
    expect(inputActionForKeyName("Z")).toBe("confirm");
    expect(inputActionForKeyName("Space")).toBe("confirm");
    expect(inputActionForKeyName("Enter")).toBe("confirm");
    expect(CONFIRM_KEY_NAMES).toEqual(["Z", "SPACE", "ENTER"]);
  });

  it("maps X and legacy aliases to cancel", () => {
    expect(inputActionForKeyName("X")).toBe("cancel");
    expect(inputActionForKeyName("Escape")).toBe("cancel");
    expect(inputActionForKeyName("Backspace")).toBe("cancel");
    expect(CANCEL_KEY_NAMES).toEqual(["X", "ESC", "BACKSPACE"]);
  });

  it("fires one action per key hold until release", () => {
    const keyboard = new FakeKeyboard();
    const actions: string[] = [];
    registerDiscreteKeys(keyboard, ["Z"], (keyName) => actions.push(keyName));

    keyboard.emit("keydown-Z", { code: "KeyZ", key: "z", repeat: false });
    keyboard.emit("keydown-Z", { code: "KeyZ", key: "z", repeat: false });
    keyboard.emit("keydown-Z", { code: "KeyZ", key: "z", repeat: true });

    expect(actions).toEqual(["Z"]);

    keyboard.emit("keyup-Z", { code: "KeyZ", key: "z", repeat: false });
    keyboard.emit("keydown-Z", { code: "KeyZ", key: "z", repeat: false });

    expect(actions).toEqual(["Z", "Z"]);
  });
});
