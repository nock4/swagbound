import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WindowCollection } from "@eb/schemas";
import {
  TEXT_BLIP_STORAGE_KEY,
  WINDOW_FLAVOR_STORAGE_KEY,
  activeWindowFlavorId,
  registerWindowFlavorControls,
  setTextBlipEnabled,
  setWindowFlavorId,
  textBlipEnabled
} from "../src/windowSettings";
import { activeEbWindowFrame, setActiveWindowFlavorIndex } from "../src/windowFrame";
import { EB_WINDOW_FRAMES } from "../src/windowFrames.generated";

describe("window flavor settings", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    setActiveWindowFlavorIndex(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__setWindowFlavor;
    delete (globalThis as Record<string, unknown>).__getWindowFlavor;
    delete (globalThis as Record<string, unknown>).__setTextBlipEnabled;
    delete (globalThis as Record<string, unknown>).__getTextBlipEnabled;
    setActiveWindowFlavorIndex(0);
  });

  it("falls back to the generated default flavor when storage is empty or invalid", () => {
    const window = syntheticWindowCollection();

    expect(activeWindowFlavorId(window)).toBe(0);

    storage.setItem(WINDOW_FLAVOR_STORAGE_KEY, "99");
    expect(activeWindowFlavorId(window)).toBe(0);

    storage.setItem(WINDOW_FLAVOR_STORAGE_KEY, "not-a-number");
    expect(activeWindowFlavorId(window)).toBe(0);
  });

  it("persists valid helper changes and rejects unknown flavor ids", () => {
    const window = syntheticWindowCollection();
    registerWindowFlavorControls(window);

    const setWindowFlavor = (globalThis as { __setWindowFlavor?: (flavorId: number) => number | undefined }).__setWindowFlavor;
    const getWindowFlavor = (globalThis as { __getWindowFlavor?: () => number | undefined }).__getWindowFlavor;

    expect(setWindowFlavor?.(4)).toBe(4);
    expect(storage.getItem(WINDOW_FLAVOR_STORAGE_KEY)).toBe("4");
    expect(getWindowFlavor?.()).toBe(4);
    expect(activeEbWindowFrame()).toBe(EB_WINDOW_FRAMES[4]);

    expect(setWindowFlavor?.(12)).toBeUndefined();
    expect(storage.getItem(WINDOW_FLAVOR_STORAGE_KEY)).toBe("4");
  });

  it("can be set directly for tests and scene code", () => {
    const window = syntheticWindowCollection();

    expect(setWindowFlavorId(6, window)).toBe(6);
    expect(activeWindowFlavorId(window)).toBe(6);
  });

  it("persists the dialogue text blip toggle", () => {
    registerWindowFlavorControls(syntheticWindowCollection());
    const setTextBlip = (globalThis as { __setTextBlipEnabled?: (enabled: boolean) => boolean }).__setTextBlipEnabled;
    const getTextBlip = (globalThis as { __getTextBlipEnabled?: () => boolean }).__getTextBlipEnabled;

    expect(textBlipEnabled()).toBe(true);
    expect(setTextBlip?.(false)).toBe(false);
    expect(storage.getItem(TEXT_BLIP_STORAGE_KEY)).toBe("0");
    expect(getTextBlip?.()).toBe(false);

    expect(setTextBlipEnabled(true)).toBe(true);
    expect(storage.getItem(TEXT_BLIP_STORAGE_KEY)).toBe("1");
    expect(textBlipEnabled()).toBe(true);
  });
});

function syntheticWindowCollection(): WindowCollection {
  return {
    defaultFlavorId: 0,
    transparentKey: { r: 0, g: 224, b: 112 },
    flavors: Array.from({ length: 7 }, (_, id) => ({
      id,
      file: `assets/window/${id}.png`,
      corner: { x: 32, y: 0, w: 8, h: 8 },
      hEdge: { x: 40, y: 0, w: 8, h: 8 },
      vEdge: { x: 48, y: 0, w: 8, h: 8 },
      moreArrow: { x: 32, y: 8, w: 8, h: 8 },
      interiorColor: { r: 16 + id, g: 24 + id, b: 32 + id }
    }))
  };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}
