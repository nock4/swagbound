import Phaser from "phaser";
import {
  buildDialoguePages,
  ManifestSchema,
  NpcReferenceCollectionSchema,
  resolveScriptReference,
  ScriptCollectionSchema,
  SpriteGroupCollectionSchema,
  TutorialStatusSchema,
  ValidationReportSchema,
  type DialoguePage,
  type Manifest,
  type NpcReferenceCollection,
  type ScriptCollection,
  type SpriteGroupCollection,
  type TutorialStatus,
  type ValidationReport
} from "@eb/schemas";
import "./style.css";

type LoadedData = {
  manifest: Manifest;
  scripts?: ScriptCollection;
  npcs?: NpcReferenceCollection;
  spriteGroups?: SpriteGroupCollection;
  tutorialStatus?: TutorialStatus;
  validationReport?: ValidationReport;
};

const INTERACTION_DISTANCE = 128;

class DebugScene extends Phaser.Scene {
  private statusText?: Phaser.GameObjects.Text;
  private detailText?: Phaser.GameObjects.Text;
  private promptText?: Phaser.GameObjects.Text;
  private dialogueText?: Phaser.GameObjects.Text;
  private dialogueFooter?: Phaser.GameObjects.Text;
  private player?: Phaser.GameObjects.Rectangle;
  private npcMarker?: Phaser.GameObjects.Arc;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private dataSet?: LoadedData;
  private dialoguePages: DialoguePage[] = [];
  private pageIndex = 0;
  private dialogueOpen = false;
  private targetReference = "robot.hello_world";

  constructor() {
    super("debug");
  }

  preload(): void {
    this.load.json("manifest", "/generated/manifest.json");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111820");
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D,SPACE,ENTER,ESC,BACKSPACE") as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.on("keydown-SPACE", () => this.handleAdvance());
    this.input.keyboard?.on("keydown-ENTER", () => this.handleAdvance());
    this.input.keyboard?.on("keydown-ESC", () => this.closeDialogue());
    this.input.keyboard?.on("keydown-BACKSPACE", () => this.closeDialogue());
    void this.loadGeneratedData();
  }

  update(_: number, delta: number): void {
    if (!this.player || this.dialogueOpen) {
      return;
    }

    const speed = 160 * (delta / 1000);
    const left = this.cursors?.left?.isDown || this.keys?.A?.isDown;
    const right = this.cursors?.right?.isDown || this.keys?.D?.isDown;
    const up = this.cursors?.up?.isDown || this.keys?.W?.isDown;
    const down = this.cursors?.down?.isDown || this.keys?.S?.isDown;
    const dx = (right ? speed : 0) - (left ? speed : 0);
    const dy = (down ? speed : 0) - (up ? speed : 0);

    this.player.x = Phaser.Math.Clamp(this.player.x + dx, 70, 730);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy, 180, 360);
    this.updatePrompt();
  }

  private async loadGeneratedData(): Promise<void> {
    const rawManifest = this.cache.json.get("manifest");
    const manifestResult = ManifestSchema.safeParse(rawManifest);
    if (!manifestResult.success) {
      this.renderError("Generated manifest is missing or invalid.", "Run pnpm convert, then pnpm validate.");
      return;
    }

    const manifest = manifestResult.data;
    const [scripts, npcs, spriteGroups, tutorialStatus, validationReport] = await Promise.all([
      this.loadJson(`/generated/${manifest.files.scripts}`, ScriptCollectionSchema),
      this.loadJson(`/generated/${manifest.files.npcs}`, NpcReferenceCollectionSchema),
      this.loadJson(`/generated/${manifest.files.spriteGroups}`, SpriteGroupCollectionSchema),
      this.loadJson(`/generated/${manifest.files.tutorialStatus}`, TutorialStatusSchema),
      this.loadJson(`/generated/${manifest.files.validationReport}`, ValidationReportSchema)
    ]);

    this.dataSet = { manifest, scripts, npcs, spriteGroups, tutorialStatus, validationReport };
    this.targetReference = chooseReference(scripts, npcs);
    this.dialoguePages = buildDialogueForReference(scripts, this.targetReference);
    this.renderWorld();
    this.publishDebugState();
  }

  private async loadJson<T>(url: string, schema: { parse: (value: unknown) => T }): Promise<T | undefined> {
    try {
      const response = await fetch(url);
      return schema.parse(await response.json());
    } catch {
      return undefined;
    }
  }

  private renderError(title: string, message: string): void {
    this.add.text(24, 24, title, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "24px",
      color: "#f8fafc"
    });
    this.add.text(24, 68, message, {
      fontFamily: "Menlo, Consolas, monospace",
      fontSize: "16px",
      color: "#fca5a5"
    });
  }

  private renderWorld(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x151b24, 1);
    graphics.fillRect(0, 0, 800, 540);

    graphics.fillStyle(0x1d2732, 1);
    graphics.fillRoundedRect(24, 18, 752, 124, 8);
    graphics.lineStyle(2, 0x4b6478, 0.75);
    graphics.strokeRoundedRect(24, 18, 752, 124, 8);

    graphics.fillStyle(0x22313f, 1);
    graphics.fillRoundedRect(48, 164, 704, 228, 8);
    graphics.lineStyle(2, 0x4b6478, 0.8);
    graphics.strokeRoundedRect(48, 164, 704, 228, 8);
    graphics.lineStyle(1, 0x304454, 0.4);
    for (let x = 80; x < 740; x += 48) {
      graphics.lineBetween(x, 188, x, 368);
    }
    for (let y = 196; y < 372; y += 44) {
      graphics.lineBetween(68, y, 732, y);
    }
    graphics.lineStyle(2, 0xfacc15, 0.34);
    graphics.strokeCircle(610, 270, INTERACTION_DISTANCE);

    this.statusText = this.add.text(42, 32, this.buildStatusLines().join("\n"), {
      fontFamily: "Menlo, Consolas, monospace",
      fontSize: "12px",
      color: "#d8e4ef",
      lineSpacing: 3
    });
    this.detailText = this.add.text(516, 34, this.buildMetadataLines().join("\n"), {
      fontFamily: "Menlo, Consolas, monospace",
      fontSize: "12px",
      color: "#a7f3d0",
      lineSpacing: 4
    });

    this.player = this.add.rectangle(160, 280, 22, 22, 0x7dd3fc).setStrokeStyle(2, 0xe0f2fe);
    if (this.dialoguePages.length > 0) {
      this.npcMarker = this.add.circle(610, 270, 17, 0xfacc15).setStrokeStyle(3, 0xfef3c7);
      this.add.text(586, 300, this.targetReference, {
        fontFamily: "Menlo, Consolas, monospace",
        fontSize: "12px",
        color: "#fef9c3"
      });
    }

    this.promptText = this.add.text(48, 406, "", {
      fontFamily: "Menlo, Consolas, monospace",
      fontSize: "14px",
      color: "#e5e7eb"
    });
    this.drawDialogueBox("");
    this.updatePrompt();
  }

  private buildStatusLines(): string[] {
    const manifest = this.dataSet?.manifest;
    const npcs = this.dataSet?.npcs;
    if (!manifest) {
      return ["Generated data unavailable."];
    }
    return [
      "First Scene: CoilSnake Import",
      `Project: ${manifest.sourceProject.exists ? "found" : "missing"} | Project.snake: ${manifest.sourceProject.hasProjectSnake ? "found" : "missing"}`,
      `Scripts: ${manifest.counts.scriptFiles} files, ${manifest.counts.scriptCommands} commands`,
      `Labels: ${manifest.counts.labels} | Text: ${manifest.counts.textCommands} | Unknown: ${manifest.counts.unknownCommands}`,
      `NPC refs: ${manifest.counts.npcReferences} | robot.hello_world: ${resolveStatus(this.dataSet?.scripts, npcs)}`,
      `Tutorial: ${tutorialSummary(this.dataSet?.tutorialStatus)}`,
      `Validation issues: ${this.dataSet?.validationReport?.issues.length ?? manifest.counts.warnings + manifest.counts.errors}`
    ];
  }

  private buildMetadataLines(): string[] {
    const spriteGroups = this.dataSet?.spriteGroups;
    const sprite005 = spriteGroups?.images.find((image) => image.path === "SpriteGroups/005.png");
    return [
      "Imported Sprite Metadata",
      `PNG entries: ${spriteGroups?.counts.images ?? 0}`,
      `SpriteGroups/005.png: ${sprite005 ? "detected" : "not detected"}`,
      `Inferred id: ${sprite005?.id ?? "n/a"}`,
      "Asset rendering: disabled"
    ];
  }

  private updatePrompt(): void {
    if (!this.promptText || !this.player || !this.npcMarker) {
      this.publishDebugState();
      return;
    }
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npcMarker.x, this.npcMarker.y);
    this.promptText.setText(distance < INTERACTION_DISTANCE
      ? "Space/Enter: talk to the imported script marker"
      : "Move with Arrow keys/WASD. Approach the marker to interact.");
    this.publishDebugState();
  }

  private handleAdvance(): void {
    if (!this.dialogueOpen) {
      if (this.player && this.npcMarker) {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npcMarker.x, this.npcMarker.y);
        if (distance < INTERACTION_DISTANCE) {
          this.openDialogue();
        }
      }
      return;
    }

    this.pageIndex += 1;
    if (this.pageIndex >= this.dialoguePages.length) {
      this.closeDialogue();
      return;
    }
    this.drawDialogueBox(this.dialoguePages[this.pageIndex]?.text ?? "");
  }

  private openDialogue(): void {
    this.dialogueOpen = true;
    this.pageIndex = 0;
    this.drawDialogueBox(this.dialoguePages[0]?.text ?? "No imported script text was found.");
    this.promptText?.setText("Space/Enter: advance | Esc/Backspace: close");
    this.publishDebugState();
  }

  private closeDialogue(): void {
    this.dialogueOpen = false;
    this.pageIndex = 0;
    this.drawDialogueBox("");
    this.updatePrompt();
    this.publishDebugState();
  }

  private drawDialogueBox(text: string): void {
    this.children.getByName("dialogueGraphics")?.destroy();
    this.dialogueText?.destroy();
    this.dialogueFooter?.destroy();

    const graphics = this.add.graphics();
    graphics.setName("dialogueGraphics");
    graphics.fillStyle(0x090f1f, 0.96);
    graphics.fillRoundedRect(48, 438, 704, 82, 8);
    graphics.lineStyle(3, 0xf8fafc, 1);
    graphics.strokeRoundedRect(50, 440, 700, 78, 7);

    const displayText = text || "Move to the marker and interact to play imported dialogue.";
    this.dialogueText = this.add.text(72, 458, wrapText(displayText, 74), {
      fontFamily: "Menlo, Consolas, monospace",
      fontSize: "16px",
      color: "#ffffff",
      lineSpacing: 6,
      wordWrap: { width: 656 }
    });

    const footer = this.dialogueOpen
      ? (this.pageIndex < this.dialoguePages.length - 1 ? "Space/Enter: next" : "Space/Enter: close")
      : "Space/Enter: interact";
    this.dialogueFooter = this.add.text(560, 497, footer, {
      fontFamily: "Menlo, Consolas, monospace",
      fontSize: "11px",
      color: "#cbd5e1"
    });
  }

  private publishDebugState(): void {
    const distance = this.player && this.npcMarker
      ? Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npcMarker.x, this.npcMarker.y)
      : undefined;
    (globalThis as Record<string, unknown>).__firstSceneDebug = {
      dialogueOpen: this.dialogueOpen,
      dialogueText: this.dialoguePages[this.pageIndex]?.text ?? "",
      dialoguePageIndex: this.pageIndex,
      dialoguePageCount: this.dialoguePages.length,
      targetReference: this.targetReference,
      player: this.player ? { x: this.player.x, y: this.player.y } : undefined,
      npc: this.npcMarker ? { x: this.npcMarker.x, y: this.npcMarker.y } : undefined,
      prompt: this.promptText?.text ?? "",
      distanceToNpc: distance,
      inInteractionRange: distance === undefined ? false : distance < INTERACTION_DISTANCE,
      movementBounds: { minX: 70, maxX: 730, minY: 180, maxY: 360 },
      statusLines: this.buildStatusLines(),
      metadataLines: this.buildMetadataLines(),
      tutorial: this.dataSet?.tutorialStatus?.counts,
      resolveStatus: resolveStatus(this.dataSet?.scripts, this.dataSet?.npcs)
    };
  }
}

function chooseReference(scripts?: ScriptCollection, npcs?: NpcReferenceCollection): string {
  if (hasReference(npcs, "robot.hello_world")) {
    return "robot.hello_world";
  }
  if (scripts && resolveScriptReference(scripts, "robot.hello_world")) {
    return "robot.hello_world";
  }
  return npcs?.references[0]?.reference ?? "robot.hello_world";
}

function buildDialogueForReference(scripts: ScriptCollection | undefined, reference: string): DialoguePage[] {
  if (!scripts) {
    return [{ text: "Generated scripts.json could not be loaded.", ended: true, unknownCommands: [] }];
  }
  const resolved = resolveScriptReference(scripts, reference);
  if (!resolved) {
    return [{ text: "No imported script text was found.", ended: true, unknownCommands: [] }];
  }
  return buildDialoguePages(resolved.commands);
}

function hasReference(npcs: NpcReferenceCollection | undefined, reference: string): boolean {
  return Boolean(npcs?.references.some((item) => item.reference === reference));
}

function resolveStatus(scripts: ScriptCollection | undefined, npcs: NpcReferenceCollection | undefined): string {
  const scriptResolved = scripts ? Boolean(resolveScriptReference(scripts, "robot.hello_world")) : false;
  const npcResolved = hasReference(npcs, "robot.hello_world");
  if (scriptResolved && npcResolved) {
    return "script + npc ref";
  }
  if (scriptResolved) {
    return "script only";
  }
  if (npcResolved) {
    return "npc ref only";
  }
  return "missing";
}

function tutorialSummary(tutorialStatus: TutorialStatus | undefined): string {
  if (!tutorialStatus) {
    return "status unavailable";
  }
  const counts = tutorialStatus.counts;
  return `${counts.passed}/${counts.steps} pass, ${counts.failed} gaps, ${counts.blocked} blocked`;
}

function wrapText(text: string, lineLength: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > lineLength) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.join("\n");
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: 800,
  height: 540,
  backgroundColor: "#111820",
  scene: [DebugScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
