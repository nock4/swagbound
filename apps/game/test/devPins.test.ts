import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sceneSource = readFileSync(new URL("../src/chunkedWorldScene.ts", import.meta.url), "utf8");

describe("dev annotation pins", () => {
  it("persists pin data in the Phaser registry and rehydrates rendered pins on create", () => {
    expect(sceneSource).toContain('const DEV_PINS_REGISTRY_KEY = "dev-annotation-pins";');
    expect(sceneSource).toContain("type DevPinData = { x: number; y: number; n: number };");
    expect(sceneSource).toContain("this.registry.set(DEV_PINS_REGISTRY_KEY, [...pins, pin]);");
    expect(sceneSource).toContain("private renderDevPinsFromRegistry(): void");
    expect(sceneSource).toMatch(/this\.updatePrompt\(\);\s+if \(import\.meta\.env\.DEV\) \{\s+this\.renderDevPinsFromRegistry\(\);/);
  });

  it("continues numbering from persisted pin data instead of live containers", () => {
    expect(sceneSource).toMatch(/const n = pins\.reduce\(\(max, pin\) => Math\.max\(max, pin\.n\), 0\) \+ 1;/);
    expect(sceneSource).not.toContain("const n = this.devPins.length + 1;");
  });
});
