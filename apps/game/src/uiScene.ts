import Phaser from "phaser";
import type { WorldScene } from "./worldScene";
import type { MenuRenderScreen } from "./menuModel";

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
  private menuGraphics?: Phaser.GameObjects.Graphics;
  private menuTexts: Phaser.GameObjects.Text[] = [];
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
    this.menuGraphics = this.add.graphics().setDepth(14);
  }

  update(): void {
    const world = this.scene.get(this.worldSceneKey) as WorldScene | undefined;
    if (!world) {
      return;
    }

    const open = world.dialogue.open;
    const text = open ? world.dialogue.revealedText : "";
    const footer = open
      ? (!world.dialogue.revealComplete
          ? "Space/Enter: finish"
          : (world.dialogue.isLastPage ? "Space/Enter: close" : "Space/Enter: next"))
      : "";
    const panelVisible = world.debugPanelVisible;
    const runtimeLines = panelVisible ? world.runtimeLines() : [];
    const menuScreens = world.menuRenderStack();
    const signature = `${open}|${text}|${footer}|${world.dialogue.revealComplete}|${world.prompt}|${panelVisible}|${runtimeLines.join("/")}|${JSON.stringify(menuScreens)}`;
    if (signature === this.lastSignature) {
      return;
    }
    this.lastSignature = signature;

    this.promptText?.setText(world.prompt);
    this.drawDialogue(open, text, footer);
    this.drawPanel(panelVisible ? [...world.statusLines(), "", ...world.metadataLines(), "", ...runtimeLines] : []);
    this.drawMenu(menuScreens);
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

    this.drawWindow(graphics, x, y, boxWidth, boxHeight, 6);

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
    this.drawWindow(graphics, 12, 30, width, height, 6);
    this.panelText.setPosition(24, 41);
    this.panelText.setText(lines.join("\n"));
  }

  private drawMenu(screens: MenuRenderScreen[]): void {
    const graphics = this.menuGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    for (const text of this.menuTexts) {
      text.destroy();
    }
    this.menuTexts = [];
    if (screens.length === 0) {
      return;
    }

    const margin = 24;
    const gap = 10;
    const top = 46;
    let x = margin;
    screens.forEach((screen, index) => {
      const remaining = this.scale.width - x - margin;
      const boxWidth = index === 0 ? Math.min(136, remaining) : Math.max(160, remaining);
      const compact = screen.id === "status";
      const fontSize = compact ? "10px" : "13px";
      const lineHeight = compact ? 15 : 18;
      const boxHeight = Math.min(
        this.scale.height - top - 20,
        38 + Math.max(1, screen.items.length) * lineHeight + 12
      );
      this.drawWindow(graphics, x, top, boxWidth, boxHeight, 6);

      this.menuTexts.push(this.add.text(x + 14, top + 10, screen.title, {
        fontFamily: MONO,
        fontSize: "12px",
        color: "#f8fafc"
      }).setDepth(15));

      const itemTop = top + 32;
      const maxItems = Math.max(0, Math.floor((boxHeight - 44) / lineHeight));
      const visibleItems = screen.items.slice(0, maxItems);
      visibleItems.forEach((item, itemIndex) => {
        const selected = item.selected && item.enabled;
        const prefix = selected ? ">" : " ";
        const label = `${prefix} ${item.label}`;
        this.menuTexts.push(this.add.text(x + 14, itemTop + itemIndex * lineHeight, label, {
          fontFamily: MONO,
          fontSize,
          color: item.enabled ? "#f8fafc" : "#94a3b8",
          fixedWidth: boxWidth - 28
        }).setDepth(15));
      });

      x += boxWidth + gap;
    });
  }

  private drawWindow(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    graphics.fillStyle(0x0a0f1e, 0.97);
    graphics.fillRoundedRect(x, y, width, height, radius);
    graphics.lineStyle(3, 0xf8fafc, 1);
    graphics.strokeRoundedRect(x + 2, y + 2, width - 4, height - 4, Math.max(1, radius - 1));
    graphics.lineStyle(1, 0x64748b, 1);
    graphics.strokeRoundedRect(x + 7, y + 7, width - 14, height - 14, Math.max(1, radius - 2));
  }
}
