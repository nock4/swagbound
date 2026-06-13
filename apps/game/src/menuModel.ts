import type { CharacterCollection, ItemCollection, ItemData, PsiCollection, PsiData } from "@eb/schemas";
import { buildPartyMember, type PartyMember, type PartyMemberStats } from "./characterModel";
import type { DialogueResolver } from "./dialogueRenderer";
import { equipmentSlotForItemType, type EquipmentSlot, type EquippedSlots, type PartyVitals } from "./partyState";

export type MenuItem = {
  id: string;
  label: string;
  enabled: boolean;
  childScreenId?: string;
  actionId?: string;
};

export type MenuScreen = {
  id: string;
  title: string;
  items: MenuItem[];
  wrap?: boolean;
};

export type MenuFrame = {
  screen: MenuScreen;
  cursorIndex: number;
};

export type MenuState = {
  open: boolean;
  stack: MenuFrame[];
};

export type MenuTransition = {
  state: MenuState;
  actionId?: string;
};

export type MenuDebugState = {
  open: boolean;
  stack: string[];
  cursorIndex: number;
  currentItemId?: string;
};

export type MenuRenderItem = {
  id: string;
  label: string;
  enabled: boolean;
  selected: boolean;
};

export type MenuRenderScreen = {
  id: string;
  title: string;
  cursorIndex: number;
  items: MenuRenderItem[];
};

export type StatusMemberViewModel = {
  id: number;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
  stats: PartyMemberStats;
};

export type StatusViewModel = {
  title: "Status";
  wallet: number;
  members: StatusMemberViewModel[];
};

export type StatusViewModelInput = {
  characters?: CharacterCollection;
  partyMembers?: PartyMember[];
  partyState?: {
    wallet: number;
    party(): number[];
    inventory?(char: number): number[];
    equipped?(char: number): EquippedSlots;
    vitals?(char: number): PartyVitals | undefined;
  };
  wallet?: number;
};

export type ActivePartyMemberViewModel = {
  id: number;
  name: string;
  level: number;
};

export type InventoryMenuEntry = {
  id: string;
  itemId: number;
  slot: number;
  ownerChar: number;
  label: string;
  equippable: boolean;
  equipmentSlot?: EquipmentSlot;
  equipped: boolean;
  helpText?: string;
  detailScreenId: string;
  actionScreenId: string;
  useTargetScreenId: string;
  equipActionScreenId: string;
};

export type GoodsViewModel = {
  title: "Goods";
  member: ActivePartyMemberViewModel;
  targets: ActivePartyMemberViewModel[];
  entries: InventoryMenuEntry[];
};

export type EquipViewModel = {
  title: "Equip";
  member: ActivePartyMemberViewModel;
  entries: InventoryMenuEntry[];
};

export type PsiMenuEntry = {
  id: string;
  psiId: number;
  label: string;
  type: string;
  level: number;
};

export type PsiViewModel = {
  title: "PSI";
  member: ActivePartyMemberViewModel;
  entries: PsiMenuEntry[];
};

export type CheckViewModel = {
  title: "Check";
  member: ActivePartyMemberViewModel;
  entries: InventoryMenuEntry[];
};

export type MenuAction =
  | {
      kind: "save";
    }
  | {
      kind: "itemUse";
      ownerChar: number;
      inventorySlot: number;
      itemId: number;
      targetChar: number;
    }
  | {
      kind: "equip";
      char: number;
      inventorySlot: number;
      itemId: number;
    };

export type PartyMenuViewModelInput = StatusViewModelInput & {
  items?: ItemCollection;
  psi?: PsiCollection;
  resolver?: Pick<DialogueResolver, "itemName" | "psiName">;
};

export const MAIN_MENU_ID = "main";
export const STATUS_MENU_ID = "status";
export const SAVE_MENU_ACTION_ID = "save";
const ITEM_USE_ACTION_PREFIX = "item-use";
const EQUIP_ACTION_PREFIX = "equip";

const MAIN_COMMANDS: Array<Omit<MenuItem, "enabled">> = [
  { id: "talk", label: "Talk", childScreenId: "talk" },
  { id: "goods", label: "Goods", childScreenId: "goods" },
  { id: "psi", label: "PSI", childScreenId: "psi" },
  { id: STATUS_MENU_ID, label: "Status", childScreenId: STATUS_MENU_ID },
  { id: "equip", label: "Equip", childScreenId: "equip" },
  { id: "check", label: "Check", childScreenId: "check" },
  { id: SAVE_MENU_ACTION_ID, label: "Save", actionId: SAVE_MENU_ACTION_ID }
];

export function closedMenu(): MenuState {
  return { open: false, stack: [] };
}

export function openMenu(rootScreen: MenuScreen): MenuState {
  return {
    open: true,
    stack: [{ screen: rootScreen, cursorIndex: initialCursor(rootScreen) }]
  };
}

export function moveMenu(state: MenuState, delta: number, options: { wrap?: boolean } = {}): MenuState {
  const active = currentFrame(state);
  if (!active || delta === 0 || active.screen.items.length === 0) {
    return state;
  }
  const enabledIndexes = active.screen.items
    .map((item, index) => item.enabled ? index : -1)
    .filter((index) => index >= 0);
  if (enabledIndexes.length === 0) {
    return state;
  }

  const step = Math.trunc(delta);
  const currentPosition = enabledIndexes.indexOf(active.cursorIndex);
  const startPosition = currentPosition >= 0
    ? currentPosition
    : (step < 0 ? enabledIndexes.length : -1);
  const nextPosition = (active.screen.wrap ?? options.wrap ?? true)
    ? modulo(startPosition + step, enabledIndexes.length)
    : clamp(startPosition + step, 0, enabledIndexes.length - 1);
  return replaceCurrentFrame(state, {
    ...active,
    cursorIndex: enabledIndexes[nextPosition]
  });
}

export function confirmMenu(
  state: MenuState,
  screenById: (id: string) => MenuScreen | undefined
): MenuTransition {
  const active = currentFrame(state);
  const item = currentItem(state);
  if (!active || !item?.enabled) {
    return { state };
  }
  if (item.childScreenId) {
    const child = screenById(item.childScreenId);
    if (!child) {
      return { state };
    }
    return {
      state: {
        open: true,
        stack: [...state.stack, { screen: child, cursorIndex: initialCursor(child) }]
      }
    };
  }
  if (item.actionId) {
    return { state, actionId: item.actionId };
  }
  return { state };
}

export function cancelMenu(state: MenuState): MenuState {
  if (!state.open || state.stack.length === 0) {
    return closedMenu();
  }
  if (state.stack.length === 1) {
    return closedMenu();
  }
  return {
    open: true,
    stack: state.stack.slice(0, -1)
  };
}

export function currentItem(state: MenuState): MenuItem | undefined {
  const active = currentFrame(state);
  return active?.screen.items[active.cursorIndex];
}

export function menuDebugState(state: MenuState): MenuDebugState {
  const active = currentFrame(state);
  const item = currentItem(state);
  return {
    open: state.open,
    stack: state.stack.map((frame) => frame.screen.id),
    cursorIndex: active?.cursorIndex ?? -1,
    currentItemId: item?.id
  };
}

export function menuRenderStack(state: MenuState): MenuRenderScreen[] {
  return state.stack.map((frame) => ({
    id: frame.screen.id,
    title: frame.screen.title,
    cursorIndex: frame.cursorIndex,
    items: frame.screen.items.map((item, index) => ({
      id: item.id,
      label: item.label,
      enabled: item.enabled,
      selected: index === frame.cursorIndex
    }))
  }));
}

export function buildMainMenuScreen(): MenuScreen {
  return {
    id: MAIN_MENU_ID,
    title: "Command",
    items: MAIN_COMMANDS.map((item) => ({ ...item, enabled: true }))
  };
}

export function buildMenuScreens(status: StatusViewModel, input: PartyMenuViewModelInput = {}): MenuScreen[] {
  const goods = buildGoodsViewModel(input);
  const psi = buildPsiViewModel(input);
  const equip = buildEquipViewModel(input);
  const check = buildCheckViewModel(input);
  return [
    buildMainMenuScreen(),
    buildPlaceholderScreen("talk", "Talk"),
    buildGoodsScreen(goods),
    ...buildGoodsActionScreens(goods),
    buildPsiScreen(psi),
    buildStatusScreen(status),
    buildEquipScreen(equip),
    ...buildEquipActionScreens(equip),
    buildCheckScreen(check),
    ...buildCheckDetailScreens(check)
  ];
}

export function buildStatusViewModel(input: StatusViewModelInput = {}): StatusViewModel {
  const members = selectedPartyMembers(input);
  return {
    title: "Status",
    wallet: stat(input.partyState?.wallet ?? input.wallet ?? 0),
    members: members.map((member) => {
      const vitals = input.partyState?.vitals?.(member.id);
      return {
        id: member.id,
        name: member.name.trim() || "PLAYER",
        level: stat(member.level),
        hp: stat(vitals?.hp.displayed ?? member.hp),
        maxHp: stat(vitals?.maxHp ?? member.maxHp),
        pp: stat(vitals?.pp ?? member.pp),
        maxPp: stat(vitals?.maxPp ?? member.maxPp),
        stats: {
          offense: stat(member.stats.offense),
          defense: stat(member.stats.defense),
          speed: stat(member.stats.speed),
          guts: stat(member.stats.guts),
          vitality: stat(member.stats.vitality),
          iq: stat(member.stats.iq),
          luck: stat(member.stats.luck)
        }
      };
    })
  };
}

export function buildGoodsViewModel(input: PartyMenuViewModelInput = {}): GoodsViewModel {
  const member = activePartyMember(input);
  return {
    title: "Goods",
    member: activeMemberView(member),
    targets: selectedPartyMembers(input).map(activeMemberView),
    entries: inventoryEntries(input, member)
  };
}

export function buildEquipViewModel(input: PartyMenuViewModelInput = {}): EquipViewModel {
  const member = activePartyMember(input);
  return {
    title: "Equip",
    member: activeMemberView(member),
    entries: inventoryEntries(input, member).filter((entry) => entry.equippable)
  };
}

export function buildPsiViewModel(input: PartyMenuViewModelInput = {}): PsiViewModel {
  const member = activePartyMember(input);
  const entries = (input.psi?.psi ?? [])
    .filter((psi) => isLearnedByMember(psi, member.id, member.level))
    .sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id)
    .map((psi) => {
      const learned = psi.learnedBy.find((item) => item.charId === member.id);
      return {
        id: `psi-${psi.id}`,
        psiId: psi.id,
        label: fitMenuLabel([resolvePsiName(input, psi), psi.strength].filter(Boolean).join(" ")),
        type: psi.type,
        level: learned?.level ?? 0
      };
    });
  return {
    title: "PSI",
    member: activeMemberView(member),
    entries
  };
}

export function buildCheckViewModel(input: PartyMenuViewModelInput = {}): CheckViewModel {
  const member = activePartyMember(input);
  return {
    title: "Check",
    member: activeMemberView(member),
    entries: inventoryEntries(input, member)
  };
}

export function buildStatusScreen(status: StatusViewModel): MenuScreen {
  return {
    id: STATUS_MENU_ID,
    title: status.title,
    items: statusItems(status),
    wrap: false
  };
}

export function buildGoodsScreen(goods: GoodsViewModel): MenuScreen {
  return {
    id: "goods",
    title: goods.title,
    items: goods.entries.length > 0
      ? goods.entries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          enabled: true,
          childScreenId: entry.actionScreenId
        }))
      : [{ id: "goods-empty", label: `${goods.member.name} has no goods.`, enabled: false }],
    wrap: false
  };
}

export function buildGoodsActionScreens(goods: GoodsViewModel): MenuScreen[] {
  return goods.entries.flatMap((entry) => [
    {
      id: entry.actionScreenId,
      title: "Goods",
      items: [
        {
          id: `${entry.id}-use`,
          label: "Use",
          enabled: true,
          childScreenId: entry.useTargetScreenId
        }
      ],
      wrap: false
    },
    {
      id: entry.useTargetScreenId,
      title: "Use",
      items: goods.targets.length > 0
        ? goods.targets.map((target) => ({
            id: `${entry.id}-target-${target.id}`,
            label: target.name,
            enabled: true,
            actionId: buildItemUseActionId(entry.ownerChar, entry.slot, entry.itemId, target.id)
          }))
        : [{ id: `${entry.id}-no-target`, label: "No target.", enabled: false }],
      wrap: false
    }
  ]);
}

export function buildEquipScreen(equip: EquipViewModel): MenuScreen {
  return {
    id: "equip",
    title: equip.title,
    items: equip.entries.length > 0
      ? equip.entries.map((entry) => ({
          id: `equip-${entry.slot}-${entry.itemId}`,
          label: fitMenuLabel([
            entry.equipped ? "Eq" : "",
            entry.label,
            equipmentSlotLabel(entry.equipmentSlot)
          ].filter(Boolean).join(" ")),
          enabled: true,
          childScreenId: entry.equipActionScreenId
        }))
      : [{ id: "equip-empty", label: "No equippable goods.", enabled: false }],
    wrap: false
  };
}

export function buildEquipActionScreens(equip: EquipViewModel): MenuScreen[] {
  return equip.entries.map((entry) => ({
    id: entry.equipActionScreenId,
    title: "Equip",
    items: [
      {
        id: `${entry.id}-equip`,
        label: entry.equipped ? "Unequip" : "Equip",
        enabled: true,
        actionId: buildEquipActionId(entry.ownerChar, entry.slot, entry.itemId)
      }
    ],
    wrap: false
  }));
}

export function buildPsiScreen(psi: PsiViewModel): MenuScreen {
  const items: MenuItem[] = [];
  let previousType: string | undefined;
  const showGroups = new Set(psi.entries.map((entry) => entry.type).filter(Boolean)).size > 1;
  for (const entry of psi.entries) {
    if (showGroups && entry.type && entry.type !== previousType) {
      items.push({ id: `psi-type-${items.length}`, label: fitMenuLabel(`Type ${entry.type}`), enabled: false });
      previousType = entry.type;
    }
    items.push({
      id: entry.id,
      label: entry.label,
      enabled: true
    });
  }
  return {
    id: "psi",
    title: psi.title,
    items: items.length > 0 ? items : [{ id: "psi-empty", label: "No learned PSI.", enabled: false }],
    wrap: false
  };
}

export function buildCheckScreen(check: CheckViewModel): MenuScreen {
  return {
    id: "check",
    title: check.title,
    items: check.entries.length > 0
      ? check.entries.map((entry) => ({
          id: `check-${entry.slot}-${entry.itemId}`,
          label: entry.label,
          enabled: true,
          childScreenId: entry.detailScreenId
        }))
      : [{ id: "check-empty", label: "No goods to check.", enabled: false }],
    wrap: false
  };
}

export function buildCheckDetailScreens(check: CheckViewModel): MenuScreen[] {
  return check.entries.map((entry) => ({
    id: entry.detailScreenId,
    title: "Check",
    items: [
      { id: `${entry.id}-name`, label: entry.label, enabled: false },
      ...wrapMenuText(entry.helpText?.trim() || `[item ${entry.itemId} help]`, 42).map((line, index) => ({
        id: `${entry.id}-help-${index}`,
        label: line,
        enabled: false
      }))
    ],
    wrap: false
  }));
}

function buildPlaceholderScreen(id: string, title: string): MenuScreen {
  return {
    id,
    title,
    items: [{ id: `${id}-stub`, label: "Not implemented yet.", enabled: false }],
    wrap: false
  };
}

function statusItems(status: StatusViewModel): MenuItem[] {
  const items: MenuItem[] = [{ id: "wallet", label: `Wallet ${status.wallet}`, enabled: false }];
  status.members.forEach((member, index) => {
    items.push({
      id: `member-${index}-vitals`,
      label: `${member.name} Lv ${member.level} HP ${member.hp}/${member.maxHp} PP ${member.pp}/${member.maxPp}`,
      enabled: false
    });
    items.push({
      id: `member-${index}-stats`,
      label: [
        `Off ${member.stats.offense}`,
        `Def ${member.stats.defense}`,
        `Spd ${member.stats.speed}`,
        `Guts ${member.stats.guts}`,
        `Vit ${member.stats.vitality}`,
        `IQ ${member.stats.iq}`,
        `Luck ${member.stats.luck}`
      ].join(" "),
      enabled: false
    });
  });
  return items;
}

function inventoryEntries(input: PartyMenuViewModelInput, member: PartyMember): InventoryMenuEntry[] {
  const items = itemMap(input.items);
  const inventory = input.partyState?.inventory?.(member.id) ?? member.inventory;
  const equipped = input.partyState?.equipped?.(member.id) ?? {};
  return inventory.map((itemId, slot) => {
    const item = items.get(itemId);
    const equipmentSlot = item ? equipmentSlotForItemType(item.type) : undefined;
    return {
      id: `goods-${slot}-${itemId}`,
      itemId,
      slot,
      ownerChar: member.id,
      label: fitMenuLabel(resolveItemName(input, itemId, item)),
      equippable: item?.equippable ?? false,
      ...(equipmentSlot ? { equipmentSlot } : {}),
      equipped: equipmentSlot ? equipped[equipmentSlot] === itemId : false,
      helpText: item?.helpText,
      detailScreenId: `check-item-${slot}-${itemId}`,
      actionScreenId: `goods-item-${member.id}-${slot}-${itemId}`,
      useTargetScreenId: `goods-use-target-${member.id}-${slot}-${itemId}`,
      equipActionScreenId: `equip-item-${member.id}-${slot}-${itemId}`
    };
  });
}

export function buildItemUseActionId(
  ownerChar: number,
  inventorySlot: number,
  itemId: number,
  targetChar: number
): string {
  return [
    ITEM_USE_ACTION_PREFIX,
    stat(ownerChar),
    stat(inventorySlot),
    stat(itemId),
    stat(targetChar)
  ].join(":");
}

export function buildEquipActionId(char: number, inventorySlot: number, itemId: number): string {
  return [EQUIP_ACTION_PREFIX, stat(char), stat(inventorySlot), stat(itemId)].join(":");
}

export function parseMenuAction(actionId: string): MenuAction | undefined {
  if (actionId === SAVE_MENU_ACTION_ID) {
    return { kind: "save" };
  }
  const [prefix, ...rawParts] = actionId.split(":");
  const parts = rawParts.map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) {
    return undefined;
  }
  if (prefix === ITEM_USE_ACTION_PREFIX && parts.length === 4) {
    const [ownerChar, inventorySlot, itemId, targetChar] = parts;
    return { kind: "itemUse", ownerChar, inventorySlot, itemId, targetChar };
  }
  if (prefix === EQUIP_ACTION_PREFIX && parts.length === 3) {
    const [char, inventorySlot, itemId] = parts;
    return { kind: "equip", char, inventorySlot, itemId };
  }
  return undefined;
}

function selectedPartyMembers(input: StatusViewModelInput): PartyMember[] {
  const sessionPartyIds = input.partyState?.party() ?? [];
  const baseMembers = input.partyMembers ?? input.characters?.characters.map(buildPartyMember) ?? [];
  const selectedMembers = sessionPartyIds.length > 0
    ? sessionPartyIds
        .map((id) => baseMembers.find((member) => member.id === id))
        .filter((member): member is PartyMember => Boolean(member))
    : baseMembers;
  return selectedMembers.length > 0 ? selectedMembers : [neutralPartyMember()];
}

function activePartyMember(input: StatusViewModelInput): PartyMember {
  return selectedPartyMembers(input)[0] ?? neutralPartyMember();
}

function activeMemberView(member: PartyMember): ActivePartyMemberViewModel {
  return {
    id: member.id,
    name: member.name.trim() || "PLAYER",
    level: stat(member.level)
  };
}

function itemMap(items: ItemCollection | undefined): Map<number, ItemData> {
  return new Map(items?.items.map((item) => [item.id, item]));
}

function resolveItemName(input: PartyMenuViewModelInput, itemId: number, item: ItemData | undefined): string {
  return input.resolver?.itemName(itemId) ?? item?.name.trim() ?? `[item ${itemId}]`;
}

function resolvePsiName(input: PartyMenuViewModelInput, psi: PsiData): string {
  return input.resolver?.psiName(psi.id) ?? psi.name.trim() ?? `[psi ${psi.id}]`;
}

function isLearnedByMember(psi: PsiData, memberId: number, memberLevel: number): boolean {
  return psi.learnedBy.some((entry) => entry.charId === memberId && entry.level <= memberLevel);
}

function equipmentSlotLabel(slot: EquipmentSlot | undefined): string {
  switch (slot) {
    case "weapon":
      return "Weapon";
    case "body":
      return "Body";
    case "arms":
      return "Arms";
    case "other":
      return "Other";
    default:
      return "";
  }
}

function currentFrame(state: MenuState): MenuFrame | undefined {
  return state.open ? state.stack[state.stack.length - 1] : undefined;
}

function replaceCurrentFrame(state: MenuState, frame: MenuFrame): MenuState {
  if (!state.open || state.stack.length === 0) {
    return state;
  }
  return {
    open: true,
    stack: [...state.stack.slice(0, -1), frame]
  };
}

function initialCursor(screen: MenuScreen): number {
  const firstEnabled = screen.items.findIndex((item) => item.enabled);
  if (firstEnabled >= 0) {
    return firstEnabled;
  }
  return screen.items.length > 0 ? 0 : -1;
}

function neutralPartyMember(): PartyMember {
  return {
    id: 0,
    name: "PLAYER",
    level: 1,
    maxHp: 40,
    hp: 40,
    maxPp: 0,
    pp: 0,
    stats: {
      offense: 12,
      defense: 6,
      speed: 0,
      guts: 0,
      vitality: 0,
      iq: 0,
      luck: 0
    },
    inventory: [],
    money: 0
  };
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function fitMenuLabel(label: string, maxLength = 44): string {
  const clean = label.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 3))}...`;
}

function wrapMenuText(text: string, maxLength: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxLength) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
