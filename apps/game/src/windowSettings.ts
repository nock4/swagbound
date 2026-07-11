import type { WindowCollection } from "@eb/schemas";
import { setActiveWindowFlavorIndex } from "./windowFrame";

export const WINDOW_FLAVOR_STORAGE_KEY = "eb:windowFlavor";
export const WINDOW_FLAVOR_CHANGE_EVENT = "eb:windowFlavorChanged";
export const TEXT_BLIP_STORAGE_KEY = "eb:textBlip";
export const TEXT_BLIP_CHANGE_EVENT = "eb:textBlipChanged";

export type WindowFlavorChangeDetail = {
  flavorId: number;
};

export type TextBlipChangeDetail = {
  enabled: boolean;
};

let registeredWindow: WindowCollection | undefined;

export function registerWindowFlavorControls(window: WindowCollection | undefined): void {
  registeredWindow = window;
  const host = globalThis as Record<string, unknown>;
  host.__setWindowFlavor = (flavorId: number) => setWindowFlavorId(flavorId, registeredWindow);
  host.__getWindowFlavor = () => activeWindowFlavorId(registeredWindow);
  host.__setTextBlipEnabled = (enabled: boolean) => setTextBlipEnabled(enabled);
  host.__getTextBlipEnabled = () => textBlipEnabled();
  applyActiveWindowFlavorToRenderer();
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener(WINDOW_FLAVOR_CHANGE_EVENT, (event) => {
      const detail = (event as CustomEvent<WindowFlavorChangeDetail>).detail;
      if (detail && Number.isInteger(detail.flavorId)) {
        setActiveWindowFlavorIndex(detail.flavorId);
      }
    });
  }
}

function applyActiveWindowFlavorToRenderer(): void {
  const id = activeWindowFlavorId(registeredWindow);
  if (id !== undefined) {
    setActiveWindowFlavorIndex(id);
  }
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
  setActiveWindowFlavorIndex(selected);
  if (previous !== selected) {
    dispatchWindowFlavorChange(selected);
  }
  return selected;
}

export function textBlipEnabled(): boolean {
  const stored = readStoredTextBlipEnabled();
  return stored ?? true;
}

export function setTextBlipEnabled(enabled: boolean): boolean {
  const selected = Boolean(enabled);
  const previous = textBlipEnabled();
  if (!writeStoredTextBlipEnabled(selected)) {
    return false;
  }
  if (previous !== selected) {
    dispatchTextBlipChange(selected);
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

function readStoredTextBlipEnabled(): boolean | undefined {
  const storage = localStorageOrNull();
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(TEXT_BLIP_STORAGE_KEY);
    if (raw === null || raw.trim() === "") {
      return undefined;
    }
    if (raw === "1" || raw === "true") {
      return true;
    }
    if (raw === "0" || raw === "false") {
      return false;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function writeStoredTextBlipEnabled(enabled: boolean): boolean {
  const storage = localStorageOrNull();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(TEXT_BLIP_STORAGE_KEY, enabled ? "1" : "0");
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

function dispatchTextBlipChange(enabled: boolean): void {
  if (typeof globalThis.dispatchEvent !== "function" || typeof CustomEvent === "undefined") {
    return;
  }
  globalThis.dispatchEvent(new CustomEvent<TextBlipChangeDetail>(TEXT_BLIP_CHANGE_EVENT, {
    detail: { enabled }
  }));
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
