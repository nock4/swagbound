import Phaser from "phaser";
import { isNpcVisibleForEventFlags, type ItemData, type SpriteSheet, type WorldNpc, type WorldRegion } from "@eb/schemas";
import {
  buildDialogueForReference,
  buildMetadataLines,
  buildStatusLines,
  chooseReference,
  resolveStatus,
  TARGET_REFERENCE,
  type GameData
} from "./loader";
import { interactionEvents, type GameEvent } from "./eventRunner";
import { RuntimeEventHost, RuntimeEventSequence, type EventWarpDestination } from "./eventHost";
import { GameFlags } from "./gameFlags";
import { behaviorForNpc } from "./npcBehaviors";
import {
  createNpcState,
  facingToward,
  stepNpc,
  type NpcRuntimeState
} from "./npcController";
import {
  CANONICAL_DIRECTION_FRAMES,
  createPlayerState,
  findInteractionTarget,
  lockPlayer,
  nearestInteractable,
  stepPlayer,
  toFacing,
  unlockPlayer,
  type DirectionFrames,
  type Facing,
  type InteractionCandidate,
  type MoveInput,
  type PlayerState
} from "./playerController";
import { DialogueController, publishDebug, type DebugNpc, type FirstSceneDebug } from "./state";
import { createDialogueResolver, textSpeedCpsFromSearch } from "./dialogueRenderer";
import { PartyState } from "./partyState";
import {
  applySaveState,
  captureSaveState,
  serializeSaveState,
  type SavePlayerSnapshot,
  type SaveSlotPersistence,
  type SaveState
} from "./saveState";
import {
  buildMenuScreens,
  buildShopMenuScreens,
  buildShopViewModel,
  buildStatusViewModel,
  cancelMenu,
  closedMenu,
  confirmMenu,
  menuDebugState,
  menuRenderStack,
  moveMenu,
  openMenu,
  parseMenuAction,
  MAIN_MENU_ID,
  shopRootScreenId,
  type MenuAction,
  type MenuDebugState,
  type MenuRenderScreen,
  type MenuScreen,
  type MenuState
} from "./menuModel";
import {
  CANCEL_KEY_NAMES,
  CONFIRM_KEY_NAMES,
  MENU_DOWN_KEY_NAMES,
  MENU_UP_KEY_NAMES,
  registerDiscreteKeys
} from "./inputModel";
import { buildPartyMember, type PartyMember } from "./characterModel";
import { activeWindowFlavorId } from "./windowSettings";

export const PLAYER_SPEED = 110; // world pixels per second
export const INTERACTION_DISTANCE = 28; // world pixels between feet positions

type NpcRuntime = {
  data: WorldNpc;
  state: NpcRuntimeState;
  frames: DirectionFrames;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
};

type ActiveNpcDialogue = {
  id: number;
  restoreFacing: Facing;
};

type BlockedOptions = {
  ignoreNpcId?: number;
  includePlayer?: boolean;
  includeNpcs?: boolean;
};

export class WorldScene extends Phaser.Scene {
  private data_!: GameData;
  private world_!: WorldRegion;
  private player?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  private playerState!: PlayerState;
  private playerFrames: DirectionFrames = CANONICAL_DIRECTION_FRAMES;
  private npcRuntimes: NpcRuntime[] = [];
  private activeNpcDialogue?: ActiveNpcDialogue;
  private solidRows: string[] = [];
  private collisionCellSize = 8;
  private collisionWidth = 0;
  private collisionHeight = 0;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  readonly dialogue = new DialogueController();
  private readonly gameFlags = new GameFlags();
  private readonly partyState = new PartyState();
  private menuState: MenuState = closedMenu();
  private menuScreens = new Map<string, MenuScreen>();
  private activeShopStoreId?: number;
  private eventSequence?: RuntimeEventSequence;
  private bootSaveState?: SaveState;
  private saveSlot = 0;
  private saveSlots?: SaveSlotPersistence;
  private hasSave = false;
  private lastSavedAt?: string;
  private restoredFromSave = false;
  targetReference = TARGET_REFERENCE;
  prompt = "";
  assetsLoaded = false;
  debugPanelVisible = false;

  constructor() {
    super("world");
  }

  init(data: {
    gameData: GameData;
    saveState?: SaveState | null;
    saveSlot?: number;
    saveSlots?: SaveSlotPersistence;
  }): void {
    this.data_ = data.gameData;
    this.world_ = data.gameData.world as WorldRegion;
    this.bootSaveState = data.saveState ?? undefined;
    this.saveSlot = Number.isInteger(data.saveSlot) && (data.saveSlot as number) >= 0 ? data.saveSlot as number : 0;
    this.saveSlots = data.saveSlots;
    this.hasSave = Boolean(this.bootSaveState) || Boolean(this.saveSlots?.hasSave(this.saveSlot));
    this.lastSavedAt = this.bootSaveState?.savedAt;
    this.restoredFromSave = false;
  }

  preload(): void {
    const world = this.world_;
    if (world.images) {
      this.load.image("world-bg", `/generated/${world.images.background}`);
      this.load.image("world-fg", `/generated/${world.images.foreground}`);
    }
    for (const sheet of this.data_.sprites?.sheets ?? []) {
      this.load.spritesheet(`sheet-${sheet.groupId}`, `/generated/${sheet.file}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight
      });
    }
  }

  create(): void {
    const world = this.world_;
    this.dialogue.setTextSpeedCps(textSpeedCpsFromSearch(globalThis.location?.search));
    this.dialogue.setResolver(createDialogueResolver(this.data_));
    this.assetsLoaded = this.textures.exists("world-bg");

    if (!this.assetsLoaded) {
      // Asset files missing although world.json was valid: degrade gracefully.
      this.scene.start("fallback", { gameData: this.data_, reason: "world assets missing" });
      return;
    }

    this.cameras.main.setBackgroundColor("#000000");
    this.add.image(0, 0, "world-bg").setOrigin(0, 0).setDepth(0);
    if (this.textures.exists("world-fg")) {
      // Foreground (high-priority minitiles) renders above all actors.
      this.add.image(0, 0, "world-fg").setOrigin(0, 0).setDepth(100000);
    }

    if (world.collision) {
      this.solidRows = world.collision.solidRows;
      this.collisionCellSize = world.collision.cellSize;
      this.collisionWidth = world.collision.width;
      this.collisionHeight = world.collision.height;
    }

    this.targetReference = chooseReference(this.data_);
    const restoredPlayer = this.applyInitialSave();
    this.configureEventRuntime();

    for (const npc of world.npcs) {
      if (!this.isNpcVisible(npc)) {
        continue;
      }
      this.npcRuntimes.push(this.createNpcRuntime(npc));
    }

    const spawn = world.player?.spawnRegionPixel ?? { x: 64, y: 64 };
    this.playerFrames = this.framesForGroup(world.player?.spriteGroup);
    const playerSpawn = restoredPlayer ? this.clampPlayerPosition(restoredPlayer) : spawn;
    const playerFacing = restoredPlayer?.facing ?? "down";
    this.playerState = createPlayerState(playerSpawn.x, playerSpawn.y, playerFacing, this.playerFrames);
    this.player = this.spawnActor(playerSpawn.x, playerSpawn.y, world.player?.spriteGroup, playerFacing);

    const width = world.region?.widthPixels ?? 1024;
    const height = world.region?.heightPixels ?? 1024;
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.setZoom(2);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.roundPixels = true;

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.refreshMenuScreens();
    this.input.keyboard?.on("keydown-M", () => this.openCommandMenu());
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.moveMenuCursor(-1));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.moveMenuCursor(1));
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.handleConfirm());
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.handleCancel());
    this.input.keyboard?.on("keydown-P", () => this.handleSaveKey());
    this.input.keyboard?.on("keydown-F1", () => {
      this.debugPanelVisible = !this.debugPanelVisible;
    });

    this.scene.launch("ui", { worldSceneKey: "world", font: this.data_.font, window: this.data_.window });
    this.publish();
  }

  /** Walk-frame mapping for a sprite group: generated metadata, else canonical. */
  private framesForGroup(spriteGroup: number | undefined): DirectionFrames {
    const sheet: SpriteSheet | undefined = this.data_.sprites?.sheets.find((item) => item.groupId === spriteGroup);
    const animations = sheet?.animations;
    if (animations?.up && animations.right && animations.down && animations.left) {
      return {
        up: animations.up,
        right: animations.right,
        down: animations.down,
        left: animations.left
      };
    }
    return CANONICAL_DIRECTION_FRAMES;
  }

  private isNpcVisible(npc: Pick<WorldNpc, "showSprite" | "eventFlag">): boolean {
    return isNpcVisibleForEventFlags(npc.showSprite, npc.eventFlag, this.gameFlags);
  }

  private createNpcRuntime(npc: WorldNpc): NpcRuntime {
    const frames = this.framesForGroup(npc.spriteGroup);
    const facing = toFacing(npc.direction);
    return {
      data: npc,
      state: createNpcState(npc.regionPixel.x, npc.regionPixel.y, facing, behaviorForNpc(npc.npcId, npc.movement), frames),
      frames,
      sprite: this.spawnActor(npc.regionPixel.x, npc.regionPixel.y, npc.spriteGroup, npc.direction)
    };
  }

  /**
   * Dialogue scripts may toggle event flags; affected NPCs can pop in/out when
   * the dialogue closes.
   */
  private refreshNpcVisibility(): void {
    for (const runtime of [...this.npcRuntimes]) {
      if (this.isNpcVisible(runtime.data)) {
        continue;
      }
      runtime.sprite?.destroy();
      this.npcRuntimes = this.npcRuntimes.filter((item) => item !== runtime);
    }
    for (const npc of this.world_.npcs) {
      if (!this.isNpcVisible(npc) || this.npcRuntimes.some((runtime) => runtime.data === npc)) {
        continue;
      }
      this.npcRuntimes.push(this.createNpcRuntime(npc));
    }
  }

  private spawnActor(
    x: number,
    y: number,
    spriteGroup: number | undefined,
    direction: string | undefined
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    const key = spriteGroup !== undefined ? `sheet-${spriteGroup}` : undefined;
    if (key && this.textures.exists(key)) {
      const frames = this.framesForGroup(spriteGroup);
      const sprite = this.add.sprite(x, y, key, frames[toFacing(direction)][0]);
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(y);
      return sprite;
    }
    const placeholder = this.add.rectangle(x, y, 16, 24, 0x9aa7b8).setStrokeStyle(1, 0xe2e8f0);
    placeholder.setOrigin(0.5, 1);
    placeholder.setDepth(y);
    return placeholder;
  }

  update(_: number, delta: number): void {
    if (!this.player) {
      return;
    }
    this.partyState.tickMeters(delta);
    if (this.menuState.open) {
      if (!this.playerState.inputLocked) {
        lockPlayer(this.playerState, this.playerFrames);
      }
      this.updatePrompt();
      this.publish();
      return;
    }
    this.stepNpcs(delta);
    this.eventSequence?.update(delta);

    // Dialogue/event execution owns input while any scripted sequence is active.
    const inputOwned = this.dialogue.open || Boolean(this.eventSequence?.running);
    if (inputOwned && !this.playerState.inputLocked) {
      lockPlayer(this.playerState, this.playerFrames);
    } else if (!inputOwned && this.playerState.inputLocked) {
      unlockPlayer(this.playerState);
    }

    stepPlayer(this.playerState, this.readInput(), {
      deltaMs: delta,
      speed: PLAYER_SPEED,
      bounds: this.movementBounds(),
      blocked: (x, y) => this.blocked(x, y, { includeNpcs: true }),
      frames: this.playerFrames
    });

    this.player.x = this.playerState.x;
    this.player.y = this.playerState.y;
    if (this.player instanceof Phaser.GameObjects.Sprite) {
      this.player.setFrame(this.playerState.animFrame);
    }
    this.player.setDepth(this.player.y);
    this.updatePrompt();
    this.publish();
  }

  private stepNpcs(deltaMs: number): void {
    for (const npc of this.npcRuntimes) {
      stepNpc(npc.state, {
        deltaMs,
        bounds: this.movementBounds(),
        blocked: (x, y) => this.blocked(x, y, {
          ignoreNpcId: npc.data.npcId,
          includePlayer: true,
          includeNpcs: true
        }),
        frames: npc.frames
      });
      this.syncNpc(npc);
    }
  }

  private syncNpc(npc: NpcRuntime): void {
    const actor = npc.sprite;
    if (!actor) {
      return;
    }
    actor.x = npc.state.player.x;
    actor.y = npc.state.player.y;
    if (actor instanceof Phaser.GameObjects.Sprite) {
      actor.setFrame(npc.state.player.animFrame);
    }
    actor.setDepth(npc.state.player.y);
  }

  private readInput(): MoveInput {
    return {
      left: Boolean(this.cursors?.left?.isDown || this.keys?.A?.isDown),
      right: Boolean(this.cursors?.right?.isDown || this.keys?.D?.isDown),
      up: Boolean(this.cursors?.up?.isDown || this.keys?.W?.isDown),
      down: Boolean(this.cursors?.down?.isDown || this.keys?.S?.isDown)
    };
  }

  private movementBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const width = this.world_.region?.widthPixels ?? 0;
    const height = this.world_.region?.heightPixels ?? 0;
    return { minX: 8, maxX: width - 8, minY: 12, maxY: height - 1 };
  }

  /** Feet-box collision against the imported surface grid plus actor bodies. */
  private blocked(x: number, y: number, options: BlockedOptions = {}): boolean {
    if (this.surfaceBlocked(x, y)) {
      return true;
    }
    if (options.includePlayer && this.player && this.actorBodyBlocked(x, y, this.playerState.x, this.playerState.y)) {
      return true;
    }
    if (options.includeNpcs ?? true) {
      for (const npc of this.npcRuntimes) {
        if (npc.data.npcId === options.ignoreNpcId) {
          continue;
        }
        if (this.actorBodyBlocked(x, y, npc.state.player.x, npc.state.player.y)) {
          return true;
        }
      }
    }
    return false;
  }

  private surfaceBlocked(x: number, y: number): boolean {
    const corners: Array<[number, number]> = [
      [x - 7, y - 10],
      [x + 6, y - 10],
      [x - 7, y - 1],
      [x + 6, y - 1]
    ];
    for (const [px, py] of corners) {
      const cx = Math.floor(px / this.collisionCellSize);
      const cy = Math.floor(py / this.collisionCellSize);
      if (cx < 0 || cy < 0 || cx >= this.collisionWidth || cy >= this.collisionHeight) {
        return true;
      }
      if (this.solidRows[cy]?.[cx] === "1") {
        return true;
      }
    }
    return false;
  }

  private actorBodyBlocked(x: number, y: number, bodyX: number, bodyY: number): boolean {
    return Math.abs(x - bodyX) < 14 && y > bodyY - 18 && y < bodyY + 10;
  }

  private interactionCandidates(): InteractionCandidate[] {
    return this.npcRuntimes.map((npc) => ({
      id: npc.data.npcId,
      x: npc.state.player.x,
      y: npc.state.player.y,
      interactable: npc.data.interactable
    }));
  }

  /** The NPC the player is currently facing and close enough to talk to. */
  private interactionTarget(): InteractionCandidate | undefined {
    return findInteractionTarget(this.playerState, this.interactionCandidates(), {
      maxDistance: INTERACTION_DISTANCE
    })?.candidate;
  }

  private tutorialNpc(): NpcRuntime | undefined {
    return this.npcRuntimes.find((npc) => npc.data.npcId === 744) ?? this.npcRuntimes.find((npc) => npc.data.interactable);
  }

  private distanceToTutorialNpc(): number | undefined {
    const npc = this.tutorialNpc();
    if (!npc || !this.player) {
      return undefined;
    }
    return Phaser.Math.Distance.Between(this.playerState.x, this.playerState.y, npc.state.player.x, npc.state.player.y);
  }

  /** Radius-only proximity (facing not required) — used for prompts/debug. */
  private inRange(): boolean {
    return Boolean(nearestInteractable(this.playerState, this.interactionCandidates(), INTERACTION_DISTANCE));
  }

  private updatePrompt(): void {
    const target = this.interactionTarget();
    if (this.menuState.open) {
      this.prompt = "Arrows: choose | Z: select | X: back";
    } else if (this.dialogue.open) {
      this.prompt = "Z: advance | X: close";
    } else if (target) {
      this.prompt = this.talkPrompt(target.id);
    } else if (this.inRange()) {
      this.prompt = "Turn to face them, then press Z";
    } else {
      this.prompt = "Move: Arrows/WASD. Approach someone, then press Z.";
    }
  }

  private talkPrompt(npcId: number): string {
    const name = this.npcName(npcId);
    return name ? `Z: talk to ${name}` : "Z: talk";
  }

  private npcName(npcId: number): string | undefined {
    const npc = this.npcRuntimes.find((runtime) => runtime.data.npcId === npcId);
    const name = (npc?.data as { name?: unknown } | undefined)?.name;
    return typeof name === "string" && name.trim().length > 0 ? name.trim() : undefined;
  }

  private handleConfirm(): void {
    if (this.menuState.open) {
      this.confirmCommandMenu();
      return;
    }
    this.handleAdvance();
  }

  private handleCancel(): void {
    if (this.menuState.open) {
      this.cancelCommandMenu();
      return;
    }
    this.closeDialogue();
  }

  handleAdvance(): void {
    if (!this.dialogue.open) {
      if (this.eventSequence?.running) {
        return;
      }
      if (this.interactionTarget() && this.dialogue.canOpen()) {
        this.openDialogue();
      }
      return;
    }
    this.dialogue.advance();
    if (!this.dialogue.open) {
      if (this.eventSequence?.running) {
        this.eventSequence.confirm();
      } else {
        this.afterDialogueClosed();
      }
    }
    this.publish();
  }

  private openCommandMenu(): void {
    if (this.menuState.open || this.dialogue.open || this.eventSequence?.running) {
      return;
    }
    this.refreshMenuScreens();
    const root = this.menuScreens.get(MAIN_MENU_ID);
    if (!root) {
      return;
    }
    this.menuState = openMenu(root);
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  private moveMenuCursor(delta: number): void {
    if (!this.menuState.open) {
      return;
    }
    this.menuState = moveMenu(this.menuState, delta);
    this.publish();
  }

  private confirmCommandMenu(): void {
    if (!this.menuState.open) {
      return;
    }
    this.refreshMenuScreens();
    const result = confirmMenu(this.menuState, (id) => this.menuScreens.get(id));
    this.menuState = result.state;
    if (result.actionId) {
      this.handleMenuAction(result.actionId);
      return;
    }
    this.updatePrompt();
    this.publish();
  }

  private handleMenuAction(actionId: string): void {
    const action = parseMenuAction(actionId);
    if (!action) {
      this.showMenuResult("Nothing happened.");
      return;
    }
    if (action.kind === "save") {
      this.saveGame(true);
      return;
    }
    if (action.kind === "atm") {
      this.handleAtmAction(action);
      return;
    }
    if (action.kind === "shopBuy") {
      this.handleShopBuyAction(action);
      return;
    }
    if (action.kind === "shopSell") {
      this.handleShopSellAction(action);
      return;
    }
    if (action.kind === "shopCancel") {
      this.closeMenu();
      return;
    }
    if (action.kind === "itemUse") {
      this.handleItemUseAction(action);
      return;
    }
    this.handleEquipAction(action);
  }

  private handleAtmAction(action: Extract<MenuAction, { kind: "atm" }>): void {
    const amount = action.all
      ? (action.op === "deposit" ? this.partyState.wallet : this.partyState.bank)
      : action.amount ?? 0;
    const moved = this.partyState.applyAtm(action.op, amount);
    this.showMenuResult(moved > 0 ? "Done." : "No funds moved.");
  }

  private handleShopBuyAction(action: Extract<MenuAction, { kind: "shopBuy" }>): void {
    const shop = this.data_.shops?.shops.find((entry) => entry.id === action.storeId);
    if (!shop?.itemIds.includes(action.itemId)) {
      this.showMenuResult("Not for sale.");
      return;
    }
    const item = this.itemById(action.itemId) ?? fallbackShopItem(action.itemId);
    const result = this.partyState.buyItem(action.char, item);
    this.showMenuResult(result.ok ? "Bought." : "Not enough money.");
  }

  private handleShopSellAction(action: Extract<MenuAction, { kind: "shopSell" }>): void {
    if (this.partyState.inventory(action.char)[action.inventorySlot] !== action.itemId) {
      this.showMenuResult("You can't sell that.");
      return;
    }
    const item = this.itemById(action.itemId) ?? fallbackShopItem(action.itemId);
    const result = this.partyState.sellItem(action.char, item);
    this.showMenuResult(result.ok ? "Sold." : "You can't sell that.");
  }

  private handleItemUseAction(action: Extract<ReturnType<typeof parseMenuAction>, { kind: "itemUse" }>): void {
    const item = this.itemById(action.itemId);
    const target = this.partyMemberById(action.targetChar);
    if (!item || this.partyState.inventory(action.ownerChar)[action.inventorySlot] !== action.itemId) {
      this.showMenuResult("You can't use that.");
      return;
    }
    const result = this.partyState.useItem({
      ownerChar: action.ownerChar,
      targetChar: action.targetChar,
      item,
      targetVitals: vitalsForPartyMember(target)
    });
    this.showMenuResult(result.ok ? "Used." : "You can't use that.");
  }

  private handleEquipAction(action: Extract<ReturnType<typeof parseMenuAction>, { kind: "equip" }>): void {
    const item = this.itemById(action.itemId);
    if (!item || this.partyState.inventory(action.char)[action.inventorySlot] !== action.itemId) {
      this.showMenuResult("You can't equip that.");
      return;
    }
    const result = this.partyState.equip(action.char, item);
    this.showMenuResult(result.ok ? (result.equipped ? "Equipped." : "Unequipped.") : "You can't equip that.");
  }

  private itemById(itemId: number): ItemData | undefined {
    return this.data_.items?.items.find((item) => item.id === itemId);
  }

  private partyMemberById(charId: number): PartyMember | undefined {
    return this.data_.characters?.characters.map(buildPartyMember).find((member) => member.id === charId);
  }

  private showMenuResult(message: string): void {
    this.menuState = closedMenu();
    this.activeShopStoreId = undefined;
    this.refreshMenuScreens();
    this.dialogue.start([{
      text: message,
      ended: false,
      unknownCommands: [],
      segments: [{ kind: "text", value: message }]
    }]);
    this.updatePrompt();
    this.publish();
  }

  private cancelCommandMenu(): void {
    if (!this.menuState.open) {
      return;
    }
    this.menuState = cancelMenu(this.menuState);
    if (!this.menuState.open) {
      this.activeShopStoreId = undefined;
    }
    if (!this.menuState.open && !this.dialogue.open && !this.eventSequence?.running) {
      unlockPlayer(this.playerState);
    }
    this.updatePrompt();
    this.publish();
  }

  private closeMenu(): void {
    this.menuState = closedMenu();
    this.activeShopStoreId = undefined;
    this.refreshMenuScreens();
    if (!this.dialogue.open && !this.eventSequence?.running) {
      unlockPlayer(this.playerState);
    }
    this.updatePrompt();
    this.publish();
  }

  private refreshMenuScreens(): void {
    const resolver = createDialogueResolver(this.data_);
    const screens = buildMenuScreens(buildStatusViewModel({
      characters: this.data_.characters,
      partyState: this.partyState
    }), {
      characters: this.data_.characters,
      items: this.data_.items,
      psi: this.data_.psi,
      shops: this.data_.shops,
      partyState: this.partyState,
      resolver
    });
    if (this.activeShopStoreId !== undefined) {
      screens.push(...buildShopMenuScreens(buildShopViewModel({
        characters: this.data_.characters,
        items: this.data_.items,
        shops: this.data_.shops,
        partyState: this.partyState,
        resolver,
        storeId: this.activeShopStoreId
      })));
    }
    this.menuScreens = new Map(screens.map((screen) => [screen.id, screen]));
  }

  private openShopMenu(storeId: number): void {
    this.activeShopStoreId = Math.max(0, Math.floor(storeId));
    this.refreshMenuScreens();
    const root = this.menuScreens.get(shopRootScreenId(this.activeShopStoreId));
    if (!root) {
      this.activeShopStoreId = undefined;
      return;
    }
    this.menuState = openMenu(root);
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  menuRenderStack(): MenuRenderScreen[] {
    return menuRenderStack(this.menuState);
  }

  menuDebugState(): MenuDebugState {
    return menuDebugState(this.menuState);
  }

  private handleSaveKey(): void {
    if (this.menuState.open || this.dialogue.open || this.eventSequence?.running || !this.player) {
      return;
    }
    this.saveGame(false);
  }

  private saveGame(showResult: boolean): void {
    const savedAt = new Date().toISOString();
    const save = captureSaveState({
      flags: this.gameFlags,
      partyState: this.partyState,
      player: this.currentPlayerSnapshot(),
      savedAt
    });
    const blob = serializeSaveState(save);
    const saved = blob ? this.saveSlots?.saveToSlot(this.saveSlot, blob) ?? false : false;
    if (saved) {
      this.hasSave = true;
      this.lastSavedAt = savedAt;
    } else {
      this.hasSave = Boolean(this.saveSlots?.hasSave(this.saveSlot));
    }
    if (showResult) {
      this.showMenuResult(saved ? "Saved." : "Save unavailable.");
      return;
    }
    this.updatePrompt();
    this.publish();
  }

  private applyInitialSave(): SavePlayerSnapshot | undefined {
    if (!this.bootSaveState || !this.isCompatibleSavePlayer(this.bootSaveState.player)) {
      return undefined;
    }
    const player = applySaveState(this.bootSaveState, {
      flags: this.gameFlags,
      partyState: this.partyState
    });
    if (!player) {
      return undefined;
    }
    this.restoredFromSave = true;
    this.hasSave = true;
    this.lastSavedAt = this.bootSaveState.savedAt;
    return player;
  }

  private isCompatibleSavePlayer(player: SavePlayerSnapshot): boolean {
    return player.mode === "region" && player.mapId === this.saveMapId();
  }

  private currentPlayerSnapshot(): SavePlayerSnapshot {
    const region = this.world_.region;
    return {
      mode: "region",
      mapId: this.saveMapId(),
      region: {
        ...(region?.originTile ? { originTile: { ...region.originTile } } : {}),
        ...(region?.widthPixels !== undefined ? { widthPixels: region.widthPixels } : {}),
        ...(region?.heightPixels !== undefined ? { heightPixels: region.heightPixels } : {})
      },
      x: this.playerState.x,
      y: this.playerState.y,
      facing: this.playerState.facing
    };
  }

  private saveMapId(): string {
    const region = this.world_.region;
    const origin = region?.originTile ?? { x: 0, y: 0 };
    const width = region?.widthPixels ?? 0;
    const height = region?.heightPixels ?? 0;
    return `region:${origin.x},${origin.y}:${width}x${height}`;
  }

  private clampPlayerPosition(position: { x: number; y: number }): { x: number; y: number } {
    const bounds = this.movementBounds();
    return {
      x: Math.min(Math.max(position.x, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(position.y, bounds.minY), bounds.maxY)
    };
  }

  private openDialogue(): void {
    const target = this.interactionTarget();
    const npc = this.npcRuntimes.find((runtime) => runtime.data.npcId === target?.id);
    if (!npc) {
      return;
    }
    this.pauseNpcForDialogue(npc);
    lockPlayer(this.playerState, this.playerFrames);
    this.runEvents(interactionEvents(npc.data, this.targetReference, this.gameFlags));
    this.updatePrompt();
    this.publish();
  }

  private runEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case "dialogue":
          if (!this.startEventSequence(event.reference)) {
            this.dialogue.start(buildDialogueForReference(this.data_.scripts, event.reference, this.gameFlags));
          }
          break;
        case "setFlag":
          this.gameFlags.set(event.flag);
          break;
      }
    }
  }

  private pauseNpcForDialogue(npc: NpcRuntime): void {
    this.restoreActiveNpc();
    this.activeNpcDialogue = { id: npc.data.npcId, restoreFacing: npc.state.player.facing };
    npc.state.paused = true;
    this.setNpcIdleFacing(npc, facingToward(npc.state.player.x, npc.state.player.y, this.playerState.x, this.playerState.y));
  }

  private configureEventRuntime(): void {
    const host = new RuntimeEventHost({
      dialogue: this.dialogue,
      flags: this.gameFlags,
      partyState: this.partyState,
      scene: this,
      resolveWarpDestination: (dest, style) => this.resolveEventWarpDestination(dest, style),
      applyWarpDestination: (destination) => this.applyEventWarpDestination(destination),
      startBattle: (group) => this.startEventBattle(group),
      openShop: (storeId) => this.openShopMenu(storeId)
    });
    this.eventSequence = new RuntimeEventSequence(this.data_.scripts, host);
  }

  private startEventSequence(reference: string): boolean {
    return this.eventSequence?.start(reference, {
      onComplete: () => this.afterDialogueClosed()
    }) ?? false;
  }

  private resolveEventWarpDestination(dest: number, style?: number): EventWarpDestination | undefined {
    void dest;
    void style;
    // Region mode has no generated teleport table yet; the host records a no-op.
    return undefined;
  }

  private applyEventWarpDestination(destination: EventWarpDestination): void {
    const bounds = this.movementBounds();
    const x = Math.min(Math.max(destination.x, bounds.minX), bounds.maxX);
    const y = Math.min(Math.max(destination.y, bounds.minY), bounds.maxY);
    this.playerState.x = x;
    this.playerState.y = y;
    this.playerState.velocityX = 0;
    this.playerState.velocityY = 0;
    this.playerState.moving = false;
    this.playerState.facing = toFacing(destination.direction, this.playerState.facing);
    this.playerState.walkClockMs = 0;
    this.playerState.animKey = `idle-${this.playerState.facing}`;
    this.playerState.animFrame = this.playerFrames[this.playerState.facing][0];
    if (this.player) {
      this.player.x = x;
      this.player.y = y;
      if (this.player instanceof Phaser.GameObjects.Sprite) {
        this.player.setFrame(this.playerState.animFrame);
      }
      this.player.setDepth(y);
    }
    this.cameras.main.centerOn(x, y);
  }

  private startEventBattle(group: number): boolean {
    if (!this.data_.battle) {
      return false;
    }
    this.scene.stop("ui");
    this.scene.start("battle", {
      battleData: this.data_.battle,
      groupId: group,
      characters: this.data_.characters,
      items: this.data_.items,
      psi: this.data_.psi,
      font: this.data_.font,
      window: this.data_.window
    });
    return true;
  }

  private restoreActiveNpc(): void {
    if (!this.activeNpcDialogue) {
      return;
    }
    const active = this.activeNpcDialogue;
    const npc = this.npcRuntimes.find((runtime) => runtime.data.npcId === active.id);
    if (npc) {
      this.setNpcIdleFacing(npc, active.restoreFacing);
      npc.state.paused = false;
    }
    this.activeNpcDialogue = undefined;
  }

  private afterDialogueClosed(): void {
    // Release the lock before publish so debug never shows closed dialogue with locked input.
    if (!this.menuState.open) {
      unlockPlayer(this.playerState);
    }
    this.restoreActiveNpc();
    this.refreshNpcVisibility();
    this.updatePrompt();
  }

  private setNpcIdleFacing(npc: NpcRuntime, facing: Facing): void {
    npc.state.player.facing = facing;
    npc.state.player.moving = false;
    npc.state.player.velocityX = 0;
    npc.state.player.velocityY = 0;
    npc.state.player.walkClockMs = 0;
    npc.state.player.animKey = `idle-${facing}`;
    npc.state.player.animFrame = npc.frames[facing][0];
    this.syncNpc(npc);
  }

  closeDialogue(): void {
    if (!this.dialogue.open && !this.eventSequence?.running) {
      return;
    }
    if (this.dialogue.open) {
      this.dialogue.close();
    }
    this.eventSequence?.abort();
    this.afterDialogueClosed();
    this.publish();
  }

  statusLines(): string[] {
    return buildStatusLines(this.data_);
  }

  metadataLines(): string[] {
    return buildMetadataLines(this.data_);
  }

  /** Live controller state for the hidden F1 panel. */
  runtimeLines(): string[] {
    const state = this.playerState;
    return [
      "Player Runtime",
      `facing: ${state.facing} | moving: ${state.moving} | locked: ${state.inputLocked}`,
      `anim: ${state.animKey} frame ${state.animFrame}`,
      `feet: ${Math.round(state.x)},${Math.round(state.y)} | target: ${this.interactionTarget()?.id ?? "none"}`,
      `wallet: ${this.partyState.wallet} | bank: ${this.partyState.bank} | shop: ${this.activeShopStoreId ?? "none"}`,
      `save: ${this.hasSave ? "yes" : "no"} | restored: ${this.restoredFromSave ? "yes" : "no"}`
    ];
  }

  private publish(): void {
    const world = this.world_;
    const npc744 = this.tutorialNpc();
    const distance = this.distanceToTutorialNpc();
    const target = this.interactionTarget();
    const npcs: DebugNpc[] = world.npcs.map((npc) => {
      const runtime = this.npcRuntimes.find((item) => item.data.npcId === npc.npcId);
      return {
        id: npc.npcId,
        x: runtime?.state.player.x ?? npc.regionPixel.x,
        y: runtime?.state.player.y ?? npc.regionPixel.y,
        interactable: npc.interactable,
        visible: this.isNpcVisible(npc),
        facing: runtime?.state.player.facing ?? toFacing(npc.direction),
        moving: runtime?.state.player.moving ?? false,
        behaviorKind: runtime?.state.behavior.kind ?? "static",
        paused: runtime?.state.paused ?? false
      };
    });
    const state: FirstSceneDebug = {
      mode: "world",
      dialogueOpen: this.dialogue.open,
      dialogueText: this.dialogue.currentText,
      dialoguePageIndex: this.dialogue.pageIndex,
      dialoguePageCount: this.dialogue.pages.length,
      revealComplete: this.dialogue.revealComplete,
      revealedText: this.dialogue.open ? this.dialogue.revealedText : "",
      targetReference: this.targetReference,
      player: this.player ? { x: this.playerState.x, y: this.playerState.y } : undefined,
      npc: npc744 ? { x: npc744.state.player.x, y: npc744.state.player.y } : undefined,
      npcs,
      prompt: this.prompt,
      facing: this.playerState.facing,
      moving: this.playerState.moving,
      animKey: this.playerState.animKey,
      animFrame: this.playerState.animFrame,
      inputLocked: this.playerState.inputLocked,
      canInteract: Boolean(target),
      interactionTargetId: target?.id,
      activeNpcId: (this.dialogue.open || this.eventSequence?.running) ? this.activeNpcDialogue?.id : undefined,
      distanceToNpc: distance,
      inInteractionRange: this.inRange(),
      movementBounds: this.movementBounds(),
      statusLines: this.statusLines(),
      metadataLines: this.metadataLines(),
      fontLoaded: Boolean(this.data_.font),
      ...(this.data_.font ? { primaryFontId: this.data_.font.primaryFontId } : {}),
      windowLoaded: Boolean(this.data_.window),
      ...(this.data_.window ? {
        defaultFlavorId: this.data_.window.defaultFlavorId,
        activeFlavorId: activeWindowFlavorId(this.data_.window)
      } : {}),
      tutorial: this.data_.tutorialStatus?.counts,
      resolveStatus: resolveStatus(this.data_),
      dialogueCounters: { opens: this.dialogue.opens, advances: this.dialogue.advances, closes: this.dialogue.closes },
      flags: this.gameFlags.list(),
      flagsNumCount: this.gameFlags.listNums().length,
      hasSave: this.hasSave,
      ...(this.lastSavedAt ? { lastSavedAt: this.lastSavedAt } : {}),
      restoredFromSave: this.restoredFromSave,
      eventExecutor: this.eventSequence?.debug(),
      partyState: this.partyState.counts(),
      shopOpen: this.menuState.open && this.activeShopStoreId !== undefined,
      ...(this.activeShopStoreId !== undefined ? { activeShopStoreId: this.activeShopStoreId } : {}),
      menu: this.menuDebugState(),
      world: {
        available: world.available,
        originTile: world.region?.originTile,
        widthPixels: world.region?.widthPixels,
        heightPixels: world.region?.heightPixels,
        npcCount: world.counts.npcs,
        visibleNpcCount: world.npcs.filter((npc) => this.isNpcVisible(npc)).length,
        assetsLoaded: this.assetsLoaded,
        npc744WorldPixel: world.npcs.find((npc) => npc.npcId === 744)?.worldPixel,
        playerSpawn: world.player?.spawnRegionPixel
      }
    };
    publishDebug(state);
  }
}

function vitalsForPartyMember(member: PartyMember | undefined): {
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
} {
  return {
    hp: member?.hp ?? 40,
    maxHp: member?.maxHp ?? 40,
    pp: member?.pp ?? 0,
    maxPp: member?.maxPp ?? 0
  };
}

function fallbackShopItem(itemId: number): Pick<ItemData, "id" | "cost"> {
  return { id: itemId, cost: 0 };
}
