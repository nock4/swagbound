import Phaser from "phaser";
import {
  CANCEL_KEY_NAMES,
  CONFIRM_KEY_NAMES,
  MENU_DOWN_KEY_NAMES,
  MENU_LEFT_KEY_NAMES,
  MENU_RIGHT_KEY_NAMES,
  MENU_UP_KEY_NAMES,
  registerDiscreteKeys
} from "./inputModel";
import {
  CLEAN_UI_PANEL_BORDER,
  CLEAN_UI_PANEL_FILL,
  CLEAN_UI_PRIMARY,
  CLEAN_UI_SECONDARY,
  CLEAN_UI_SELECTION_TEXT,
  cleanGridCells,
  createCleanText,
  drawCleanPanel,
  drawCleanSelection
} from "./cleanUi";
import type { CanvasRect } from "./windowLayout";
import {
  applyFilingEdit,
  FILING_GRID_COLUMNS,
  FILING_GRID_ITEMS,
  FILING_INTAKE_FIELDS,
  FILING_INTAKE_REGISTRY_KEY,
  moveFilingGridCursor,
  type FilingGridDirection,
  type FilingIntakeValues
} from "./filingIntakeModel";

export interface FilingIntakeSceneData {
  nextSceneKey: string;
  nextSceneData: object;
}

const FADE_MS = 400;
const FINAL_HOLD_MS = 2500;

export class FilingIntakeScene extends Phaser.Scene {
  private nextSceneKey = "chunked-world";
  private nextSceneData: object = {};
  private fieldIndex = 0;
  private cursor = 0;
  private transitioning = false;
  private finalizing = false;
  private values: FilingIntakeValues = { name: "BOSCH", interest: "MUSIC", friend: "CLOAK" };
  private defaultIndexes = [0, 0, 0];
  private graphics?: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("filing-intake");
  }

  init(data: FilingIntakeSceneData): void {
    this.nextSceneKey = data.nextSceneKey;
    this.nextSceneData = data.nextSceneData;
    this.fieldIndex = 0;
    this.cursor = 0;
    this.transitioning = false;
    this.finalizing = false;
    this.values = {
      name: FILING_INTAKE_FIELDS[0].defaults[0],
      interest: FILING_INTAKE_FIELDS[1].defaults[0],
      friend: FILING_INTAKE_FIELDS[2].defaults[0]
    };
    this.defaultIndexes = [0, 0, 0];
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#000000");
    this.graphics = this.add.graphics().setDepth(1);
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.move("up"));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.move("down"));
    registerDiscreteKeys(this.input.keyboard, MENU_LEFT_KEY_NAMES, () => this.move("left"));
    registerDiscreteKeys(this.input.keyboard, MENU_RIGHT_KEY_NAMES, () => this.move("right"));
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.select());
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.backspace());
    this.render();
    this.cameras.main.fadeIn(FADE_MS, 0, 0, 0);
  }

  private move(direction: FilingGridDirection): void {
    if (this.transitioning || this.finalizing) {
      return;
    }
    this.cursor = moveFilingGridCursor(this.cursor, direction);
    this.render();
  }

  private select(): void {
    if (this.transitioning || this.finalizing) {
      return;
    }
    const field = FILING_INTAKE_FIELDS[this.fieldIndex];
    const item = FILING_GRID_ITEMS[this.cursor];
    if (!field || !item) {
      return;
    }
    const result = applyFilingEdit(this.values[field.id], item, {
      defaults: field.defaults,
      defaultIndex: this.defaultIndexes[this.fieldIndex] ?? 0,
      maxLength: field.maxLength
    });
    this.values = { ...this.values, [field.id]: result.value };
    this.defaultIndexes[this.fieldIndex] = result.defaultIndex;
    if (result.complete) {
      this.advance();
      return;
    }
    this.render();
  }

  private backspace(): void {
    if (this.transitioning || this.finalizing) {
      return;
    }
    const field = FILING_INTAKE_FIELDS[this.fieldIndex];
    if (!field) {
      return;
    }
    const result = applyFilingEdit(this.values[field.id], { kind: "backspace", label: "BACK" }, {
      defaults: field.defaults,
      defaultIndex: this.defaultIndexes[this.fieldIndex] ?? 0,
      maxLength: field.maxLength
    });
    this.values = { ...this.values, [field.id]: result.value };
    this.render();
  }

  private advance(): void {
    if (this.fieldIndex >= FILING_INTAKE_FIELDS.length - 1) {
      this.showFinalBeat();
      return;
    }
    this.transitioning = true;
    this.cameras.main.fadeOut(FADE_MS / 2, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.fieldIndex += 1;
      this.cursor = 0;
      this.render();
      this.cameras.main.fadeIn(FADE_MS / 2, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
        this.transitioning = false;
      });
    });
  }

  private showFinalBeat(): void {
    this.finalizing = true;
    this.registry.set(FILING_INTAKE_REGISTRY_KEY, { ...this.values });
    this.cameras.main.fadeOut(FADE_MS / 2, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.renderFinalMessage();
      this.cameras.main.fadeIn(FADE_MS / 2, 0, 0, 0);
      this.time.delayedCall(FINAL_HOLD_MS, () => {
        this.cameras.main.fadeOut(FADE_MS, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start(this.nextSceneKey, this.nextSceneData);
        });
      });
    });
  }

  private render(): void {
    const field = FILING_INTAKE_FIELDS[this.fieldIndex];
    if (!field) {
      return;
    }
    this.clearRender();
    const promptRect = rect(32, 28, 448, 78);
    const valueRect = rect(96, 122, 320, 54);
    const gridRect = rect(32, 194, 448, 184);
    const hintRect = rect(64, 392, 384, 34);
    this.drawPanel(promptRect);
    this.drawPanel(valueRect);
    this.drawPanel(gridRect);
    this.drawPanel(hintRect);
    this.addText(promptRect.x + 20, promptRect.y + 20, field.prompt, {
      fontSize: 19,
      color: CLEAN_UI_PRIMARY,
      wordWrapWidth: promptRect.width - 40
    });
    this.addText(valueRect.x + 18, valueRect.y + 10, this.values[field.id], {
      fontSize: 24,
      color: "#ffffff",
      fixedWidth: valueRect.width - 36,
      align: "center"
    });
    this.renderGrid(gridRect);
    this.addText(hintRect.x + 14, hintRect.y + 8, "ARROWS MOVE   Z SELECT   X BACK", {
      fontSize: 13,
      color: CLEAN_UI_SECONDARY,
      fixedWidth: hintRect.width - 28,
      align: "center"
    });
  }

  private renderGrid(gridRect: CanvasRect): void {
    const content = rect(gridRect.x + 16, gridRect.y + 16, gridRect.width - 32, gridRect.height - 32);
    const cells = cleanGridCells(content, FILING_GRID_ITEMS.length, FILING_GRID_COLUMNS, 4, 6);
    for (const cell of cells) {
      const item = FILING_GRID_ITEMS[cell.index];
      if (!item) {
        continue;
      }
      const selected = cell.index === this.cursor;
      if (selected && this.graphics) {
        drawCleanSelection(this.graphics, cell, true);
      }
      const fontSize = item.label.length > 6 ? 10 : item.label.length > 4 ? 12 : 16;
      const text = this.addText(cell.x, cell.y + Math.max(1, Math.round((cell.height - fontSize) / 2) - 2), item.label, {
        fontSize,
        color: selected ? CLEAN_UI_SELECTION_TEXT : "#ffffff",
        fixedWidth: cell.width,
        fixedHeight: cell.height,
        align: "center"
      });
      text.setDepth(3);
    }
  }

  private renderFinalMessage(): void {
    this.clearRender();
    const finalRect = rect(48, 170, 416, 100);
    this.drawPanel(finalRect);
    this.addText(finalRect.x + 22, finalRect.y + 35, "Filed. Thank you for existing on the record.", {
      fontSize: 18,
      color: "#ffffff",
      fixedWidth: finalRect.width - 44,
      align: "center"
    });
  }

  private drawPanel(panelRect: CanvasRect): void {
    if (!this.graphics) {
      return;
    }
    drawCleanPanel(this.graphics, panelRect, { fillColor: CLEAN_UI_PANEL_FILL });
    this.graphics.lineStyle(1, CLEAN_UI_PANEL_BORDER, 0.22);
    this.graphics.strokeRect(panelRect.x + 10.5, panelRect.y + 10.5, panelRect.width - 21, panelRect.height - 21);
  }

  private addText(
    x: number,
    y: number,
    text: string,
    options: Parameters<typeof createCleanText>[4]
  ): Phaser.GameObjects.Text {
    const object = createCleanText(this, x, y, text, options).setDepth(2);
    this.texts.push(object);
    return object;
  }

  private clearRender(): void {
    this.graphics?.clear();
    for (const text of this.texts) {
      text.destroy();
    }
    this.texts = [];
  }
}

function rect(x: number, y: number, width: number, height: number): CanvasRect {
  return { x, y, width, height };
}
