import Phaser from "phaser";
import type { WorldScene } from "./worldScene";

const MONO = "Menlo, Consolas, monospace";

/**
 * Camera-independent overlay: dialogue window, interaction prompt, and the
 * F1 debug panel. Runs at native canvas resolution above the zoomed world.
 */
export class UiScene extends Phaser.Scene {
  private worldSceneKey = "world";
  private boxGraphics?: Phaser.GameObjects.Graphics;
  private dialogueText?: Phaser.GameObjects.Text;
  private footerText?: Phaser.GameObjects.Text;
  private promptText?: Phaser.GameObjects.Text;
  private panelGraphics?: Phaser.GameObjects.Graphics;
  private panelText?: Phaser.GameObjects.Text;
  private badgeText?: Phaser.GameObjects.Text;
  private lastSignature = "";

  constructor() {
    super("ui");
  }

  init(data: { worldSceneKey?: string }): void {
    this.worldSceneKey = data.worldSceneKey ?? "world";
  }

  create(): void {
    this.boxGraphics = this.add.graphics().setDepth(10);
    this.dialogueText = this.add.text(0, 0, "", {
      fontFamily: MONO,
      fontSize: "15px",
      color: "#f8fafc",
      lineSpacing: 6,
      wordWrap: { width: this.scale.width - 96 }
    }).setDepth(11);
    this.footerText = this.add.text(0, 0, "", {
      fontFamily: MONO,
      fontSize: "10px",
      color: "#cbd5e1"
    }).setDepth(11);
    this.promptText = this.add.text(12, 10, "", {
      fontFamily: MONO,
      fontSize: "11px",
      color: "#e5e7eb",
      backgroundColor: "#0f172acc",
      padding: { x: 6, y: 3 }
    }).setDepth(11);
    this.badgeText = this.add.text(this.scale.width - 12, 10, "F1: import status", {
      fontFamily: MONO,
      fontSize: "10px",
      color: "#94a3b8",
      backgroundColor: "#0f172aa0",
      padding: { x: 5, y: 2 }
    }).setOrigin(1, 0).setDepth(11);
    this.panelGraphics = this.add.graphics().setDepth(12);
    this.panelText = this.add.text(0, 0, "", {
      fontFamily: MONO,
      fontSize: "11px",
      color: "#d8e4ef",
      lineSpacing: 3
    }).setDepth(13);
  }

  update(): void {
    const world = this.scene.get(this.worldSceneKey) as WorldScene | undefined;
    if (!world) {
      return;
    }

    const open = world.dialogue.open;
    const text = open ? world.dialogue.currentText : "";
    const footer = open
      ? (world.dialogue.isLastPage ? "Space/Enter: close" : "Space/Enter: next")
      : "";
    const panelVisible = world.debugPanelVisible;
    const runtimeLines = panelVisible ? world.runtimeLines() : [];
    const signature = `${open}|${text}|${footer}|${world.prompt}|${panelVisible}|${runtimeLines.join("/")}`;
    if (signature === this.lastSignature) {
      return;
    }
    this.lastSignature = signature;

    this.promptText?.setText(world.prompt);
    this.drawDialogue(open, text, footer);
    this.drawPanel(panelVisible ? [...world.statusLines(), "", ...world.metadataLines(), "", ...runtimeLines] : []);
  }

  private drawDialogue(open: boolean, text: string, footer: string): void {
    const graphics = this.boxGraphics;
    if (!graphics || !this.dialogueText || !this.footerText) {
      return;
    }
    graphics.clear();
    if (!open) {
      this.dialogueText.setText("");
      this.footerText.setText("");
      return;
    }
    const width = this.scale.width;
    const height = this.scale.height;
    const boxWidth = width - 48;
    const boxHeight = 104;
    const x = 24;
    const y = height - boxHeight - 18;

    // Retro double-border window using plain shapes and system fonts only.
    graphics.fillStyle(0x0a0f1e, 0.97);
    graphics.fillRoundedRect(x, y, boxWidth, boxHeight, 6);
    graphics.lineStyle(3, 0xf8fafc, 1);
    graphics.strokeRoundedRect(x + 2, y + 2, boxWidth - 4, boxHeight - 4, 5);
    graphics.lineStyle(1, 0x64748b, 1);
    graphics.strokeRoundedRect(x + 7, y + 7, boxWidth - 14, boxHeight - 14, 4);

    this.dialogueText.setPosition(x + 20, y + 18);
    this.dialogueText.setText(text);
    this.footerText.setPosition(x + boxWidth - 150, y + boxHeight - 18);
    this.footerText.setText(footer);
  }

  private drawPanel(lines: string[]): void {
    const graphics = this.panelGraphics;
    if (!graphics || !this.panelText) {
      return;
    }
    graphics.clear();
    if (lines.length === 0) {
      this.panelText.setText("");
      return;
    }
    const width = Math.min(this.scale.width - 24, 470);
    const height = lines.length * 15 + 22;
    graphics.fillStyle(0x0b1220, 0.93);
    graphics.fillRoundedRect(12, 30, width, height, 6);
    graphics.lineStyle(1, 0x4b6478, 0.9);
    graphics.strokeRoundedRect(12, 30, width, height, 6);
    this.panelText.setPosition(24, 41);
    this.panelText.setText(lines.join("\n"));
  }
}
