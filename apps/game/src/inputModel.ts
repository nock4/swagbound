export const CONFIRM_KEY_NAMES = ["Z", "SPACE", "ENTER"] as const;
export const CANCEL_KEY_NAMES = ["X", "ESC", "BACKSPACE"] as const;
export const MENU_UP_KEY_NAMES = ["UP"] as const;
export const MENU_DOWN_KEY_NAMES = ["DOWN"] as const;
export const MENU_LEFT_KEY_NAMES = ["LEFT"] as const;
export const MENU_RIGHT_KEY_NAMES = ["RIGHT"] as const;

export type InputAction = "confirm" | "cancel";

export type KeyboardEventLike = {
  code?: string;
  key?: string;
  repeat?: boolean;
};

type KeyboardLike = {
  on(eventName: string, handler: (event?: KeyboardEventLike) => void): unknown;
};

export function inputActionForKeyName(keyName: string): InputAction | undefined {
  const normalized = normalizeKeyName(keyName);
  if ((CONFIRM_KEY_NAMES as readonly string[]).includes(normalized)) {
    return "confirm";
  }
  if ((CANCEL_KEY_NAMES as readonly string[]).includes(normalized)) {
    return "cancel";
  }
  return undefined;
}

export function registerDiscreteKeys(
  keyboard: KeyboardLike | null | undefined,
  keyNames: readonly string[],
  callback: (keyName: string, event?: KeyboardEventLike) => void
): void {
  if (!keyboard) {
    return;
  }

  const pressed = new Set<string>();
  for (const keyName of keyNames) {
    const normalized = normalizeKeyName(keyName);
    keyboard.on(`keydown-${normalized}`, (event?: KeyboardEventLike) => {
      const identity = keyIdentity(normalized, event);
      if (event?.repeat || pressed.has(identity)) {
        return;
      }
      pressed.add(identity);
      callback(normalized, event);
    });
    keyboard.on(`keyup-${normalized}`, (event?: KeyboardEventLike) => {
      pressed.delete(keyIdentity(normalized, event));
    });
  }
}

export function normalizeKeyName(keyName: string): string {
  const raw = keyName.trim().toUpperCase();
  const aliases: Record<string, string> = {
    " ": "SPACE",
    SPACEBAR: "SPACE",
    ESCAPE: "ESC",
    ARROWUP: "UP",
    ARROWDOWN: "DOWN",
    ARROWLEFT: "LEFT",
    ARROWRIGHT: "RIGHT"
  };
  return aliases[raw] ?? raw;
}

function keyIdentity(keyName: string, event: KeyboardEventLike | undefined): string {
  if (event?.code) {
    return event.code;
  }
  if (event?.key) {
    return normalizeKeyName(event.key);
  }
  return keyName;
}
