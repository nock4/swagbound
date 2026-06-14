import type { WindowCollection } from "@eb/schemas";

export const WINDOW_FLAVOR_STORAGE_KEY = "eb:windowFlavor";
export const WINDOW_FLAVOR_CHANGE_EVENT = "eb:windowFlavorChanged";

export type WindowFlavorChangeDetail = {
  flavorId: number;
};

let registeredWindow: WindowCollection | undefined;

export function registerWindowFlavorControls(window: WindowCollection | undefined): void {
  registeredWindow = window;
  const host = globalThis as Record<string, unknown>;
  host.__setWindowFlavor = (flavorId: number) => setWindowFlavorId(flavorId, registeredWindow);
  host.__getWindowFlavor = () => activeWindowFlavorId(registeredWindow);
}

export function activeWindowFlavorId(window: WindowCollection | undefined): number | undefined {
  if (!window) {
    return undefined;
  }
  return resolveWindowFlavorId(window, readStoredWindowFlavorId()) ?? window.defaultFlavorId;
}

export function setWindowFlavorId(
  flavorId: number,
  window: WindowCollection | undefined = registeredWindow
): number | undefined {
  if (!window) {
    return undefined;
  }
  const selected = resolveWindowFlavorId(window, flavorId);
  if (selected === undefined) {
    return undefined;
  }
  const previous = activeWindowFlavorId(window);
  if (!writeStoredWindowFlavorId(selected)) {
    return undefined;
  }
  if (previous !== selected) {
    dispatchWindowFlavorChange(selected);
  }
  return selected;
}

export function resolveWindowFlavorId(
  window: WindowCollection | undefined,
  flavorId: number | undefined
): number | undefined {
  if (!window || flavorId === undefined || !Number.isInteger(flavorId)) {
    return undefined;
  }
  return window.flavors.some((flavor) => flavor.id === flavorId) ? flavorId : undefined;
}

function readStoredWindowFlavorId(): number | undefined {
  const storage = localStorageOrNull();
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(WINDOW_FLAVOR_STORAGE_KEY);
    if (raw === null || raw.trim() === "") {
      return undefined;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredWindowFlavorId(flavorId: number): boolean {
  const storage = localStorageOrNull();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(WINDOW_FLAVOR_STORAGE_KEY, String(flavorId));
    return true;
  } catch {
    return false;
  }
}

function dispatchWindowFlavorChange(flavorId: number): void {
  if (typeof globalThis.dispatchEvent !== "function" || typeof CustomEvent === "undefined") {
    return;
  }
  globalThis.dispatchEvent(new CustomEvent<WindowFlavorChangeDetail>(WINDOW_FLAVOR_CHANGE_EVENT, {
    detail: { flavorId }
  }));
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
