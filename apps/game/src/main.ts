import Phaser from "phaser";
import { loadGameData, parseManifest, type GameData } from "./loader";
import { publishDebug } from "./state";
import { ChunkedWorldScene } from "./chunkedWorldScene";
import { WorldScene } from "./worldScene";
import { UiScene } from "./uiScene";
import { FallbackScene } from "./fallbackScene";
import "./style.css";

const MONO = "Menlo, Consolas, monospace";

/**
 * Boot: fetches and validates the generated JSON pipeline, then starts the
 * playable world scene (real imported map/NPC data) or the fallback scene
 * (placeholder field) when world data is unavailable.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.json("manifest", "/generated/manifest.json");
  }

  create(): void {
    void this.boot();
  }

  private async boot(): Promise<void> {
    const manifest = parseManifest(this.cache.json.get("manifest"));
    if (!manifest) {
      this.renderError("Generated manifest is missing or invalid.", "Run pnpm convert, then pnpm validate.");
      return;
    }
    const data: GameData = await loadGameData(manifest);
    if (data.world?.available && "mode" in data.world && data.world.mode === "full") {
      this.scene.start("chunked-world", { gameData: data });
      return;
    }
    if (data.world?.available && !("mode" in data.world) && data.world.images) {
      this.scene.start("world", { gameData: data });
      return;
    }
    this.scene.start("fallback", {
      gameData: data,
      reason: data.world ? "world.json reports unavailable" : "world.json missing or invalid"
    });
  }

  private renderError(title: string, message: string): void {
    publishDebug({
      mode: "error",
      dialogueOpen: false,
      dialogueText: "",
      dialoguePageIndex: 0,
      dialoguePageCount: 0,
      targetReference: "robot.hello_world",
      prompt: "",
      inInteractionRange: false,
      movementBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      statusLines: [title],
      metadataLines: [],
      resolveStatus: "missing",
      error: { title, message }
    });
    this.cameras.main.setBackgroundColor("#10141b");
    this.add.text(24, 24, title, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "20px",
      color: "#f8fafc",
      wordWrap: { width: this.scale.width - 48 }
    });
    this.add.text(24, 64, message, {
      fontFamily: MONO,
      fontSize: "14px",
      color: "#fca5a5"
    });
  }
}

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "app",
  width: 512,
  height: 448,
  backgroundColor: "#000000",
  pixelArt: true,
  scene: [BootScene, WorldScene, ChunkedWorldScene, UiScene, FallbackScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
