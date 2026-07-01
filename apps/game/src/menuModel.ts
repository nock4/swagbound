import type { CharacterCollection, ItemCollection, ItemData, PsiCollection, PsiData, ShopData } from "@eb/schemas";
import { buildPartyMember, type PartyMember, type PartyMemberStats } from "./characterModel";
import type { DialogueResolver } from "./dialogueRenderer";
import {
  equipmentSlotForItemType,
  sellPriceForItem,
  type EquipmentSlot,
  type EquippedSlots,
  type PartyVitals
} from "./partyState";
import { formatStatusAilments, type StatusState } from "./statusEffects";

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
  experience: number;
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
  statuses: StatusState;
  stats: PartyMemberStats;
};

export type StatusViewModel = {
  title: "Status";
  wallet: number;
  bank: number;
  members: StatusMemberViewModel[];
};

export type StatusViewModelInput = {
  characters?: CharacterCollection;
  partyMembers?: PartyMember[];
  partyState?: {
    wallet: number;
    bank?: number;
    party(): number[];
    inventory?(char: number): number[];
    equipped?(char: number): EquippedSlots;
    vitals?(char: number): PartyVitals | undefined;
    statuses?(char: number): StatusState;
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
  slots: EquipSlotViewModel[];
};

export type EquipSlotViewModel = {
  slot: EquipmentSlot;
  label: string;
  equippedLabel: string;
  screenId: string;
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

export type ShopModeEntry = {
  id: string;
  itemId: number;
  label: string;
  cost: number;
  price: number;
  ownerChar: number;
  inventorySlot?: number;
};

export type ShopViewModel = {
  storeId: number;
  member: ActivePartyMemberViewModel;
  wallet: number;
  buyEntries: ShopModeEntry[];
  sellEntries: ShopModeEntry[];
  available: boolean;
};

export type MenuAction =
  | {
      kind: "save";
    }
  | {
      kind: "atm";
      op: "deposit" | "withdraw";
      amount?: number;
      all: boolean;
    }
  | {
      kind: "shopBuy";
      storeId: number;
      char: number;
      itemId: number;
    }
  | {
      kind: "shopSell";
      storeId: number;
      char: number;
      inventorySlot: number;
      itemId: number;
    }
  | {
      kind: "shopCancel";
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

export type TalkMenuDecision =
  | { kind: "openDialogue" }
  | { kind: "message"; message: string }
  | { kind: "close" };

export type PartyMenuViewModelInput = StatusViewModelInput & {
  items?: ItemCollection;
  psi?: PsiCollection;
  shops?: ShopData;
  resolver?: Pick<DialogueResolver, "itemName" | "psiName">;
};

export type ShopViewModelInput = PartyMenuViewModelInput & {
  storeId: number;
};

export const MAIN_MENU_ID = "main";
export const STATUS_MENU_ID = "status";
export const TALK_MENU_ACTION_ID = "talk";
export const NO_ONE_TO_TALK_TO_MESSAGE = "There's no one to talk to.";
export const SAVE_MENU_ACTION_ID = "save";
const GOODS_MENU_ID = "goods";
const PSI_MENU_ID = "psi";
const EQUIP_MENU_ID = "equip";
const ITEM_USE_ACTION_PREFIX = "item-use";
const EQUIP_ACTION_PREFIX = "equip";
const SHOP_BUY_ACTION_PREFIX = "shop-buy";
const SHOP_SELL_ACTION_PREFIX = "shop-sell";
const SHOP_CANCEL_ACTION_ID = "shop-cancel";
const ATM_ACTION_PREFIX = "atm";
const ATM_MENU_ID = "atm";
const ATM_DEBUG_AMOUNT = 100;
const EQUIP_SLOTS: EquipmentSlot[] = ["weapon", "body", "arms", "other"];

const MAIN_COMMANDS: Array<Omit<MenuItem, "enabled">> = [
  { id: TALK_MENU_ACTION_ID, label: "Talk", actionId: TALK_MENU_ACTION_ID },
  { id: GOODS_MENU_ID, label: "Goods", childScreenId: GOODS_MENU_ID },
  { id: PSI_MENU_ID, label: "PSI", childScreenId: PSI_MENU_ID },
  { id: EQUIP_MENU_ID, label: "Equip", childScreenId: EQUIP_MENU_ID },
  { id: "check", label: "Check", childScreenId: "check" },
  { id: STATUS_MENU_ID, label: "Status", childScreenId: STATUS_MENU_ID }
  // Vanilla EB's pause menu is exactly these 6. ATM is reached at ATM machines and
  // Save via phone (here: the P key, chunkedWorldScene keydown-P) - neither is a menu item.
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

export function refreshMenuStackScreens(
  state: MenuState,
  screenById: (id: string) => MenuScreen | undefined
): MenuState {
  if (!state.open || state.stack.length === 0) {
    return closedMenu();
  }
  const stack: MenuFrame[] = [];
  for (const frame of state.stack) {
    const screen = screenById(frame.screen.id);
    if (!screen) {
      return closedMenu();
    }
    stack.push({
      screen,
      cursorIndex: refreshedCursorIndex(screen, frame.cursorIndex)
    });
  }
  return { open: true, stack };
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
  const members = selectedPartyMembers(input);
  const goodsByMember = members.map((member) => buildGoodsViewModelForMember(input, member));
  const psiByMember = members.map((member) => buildPsiViewModelForMember(input, member));
  const equipByMember = members.map((member) => buildEquipViewModelForMember(input, member));
  const check = buildCheckViewModel(input);
  return [
    buildMainMenuScreen(),
    buildPartyMemberSelectScreen(GOODS_MENU_ID, "Goods", goodsByMember.map((goods) => goods.member)),
    ...goodsByMember.flatMap((goods, index) => [
      buildGoodsScreen(goods, partyMemberScreenId(GOODS_MENU_ID, index)),
      ...buildGoodsActionScreens(goods)
    ]),
    buildPartyMemberSelectScreen(PSI_MENU_ID, "PSI", psiByMember.map((psi) => psi.member)),
    ...psiByMember.map((psi, index) => buildPsiScreen(psi, partyMemberScreenId(PSI_MENU_ID, index))),
    buildStatusScreen(status),
    ...buildStatusMemberScreens(status),
    buildPartyMemberSelectScreen(EQUIP_MENU_ID, "Equip", equipByMember.map((equip) => equip.member)),
    ...equipByMember.flatMap((equip, index) => [
      buildEquipScreen(equip, partyMemberScreenId(EQUIP_MENU_ID, index)),
      ...buildEquipSlotScreens(equip),
      ...buildEquipActionScreens(equip)
    ]),
    buildCheckScreen(check),
    ...buildCheckDetailScreens(check),
    buildAtmScreen(input)
  ];
}

export function buildStatusViewModel(input: StatusViewModelInput = {}): StatusViewModel {
  const members = selectedPartyMembers(input);
  return {
    title: "Status",
    wallet: stat(input.partyState?.wallet ?? input.wallet ?? 0),
    bank: stat(input.partyState?.bank ?? 0),
    members: members.map((member) => {
      const vitals = input.partyState?.vitals?.(member.id);
      return {
        id: member.id,
        name: member.name.trim() || "PLAYER",
        level: stat(member.level),
        experience: stat(member.experience),
        hp: stat(vitals?.hp.displayed ?? member.hp),
        maxHp: stat(vitals?.maxHp ?? member.maxHp),
        pp: stat(vitals?.pp ?? member.pp),
        maxPp: stat(vitals?.maxPp ?? member.maxPp),
        statuses: input.partyState?.statuses?.(member.id) ?? member.statuses?.map((entry) => ({ ...entry })) ?? [],
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

export function buildShopViewModel(input: ShopViewModelInput): ShopViewModel {
  const member = activePartyMember(input);
  const items = itemMap(input.items);
  const shop = input.shops?.shops.find((entry) => entry.id === stat(input.storeId));
  const ownerChar = member.id;
  const buyEntries = (shop?.itemIds ?? []).map((itemId, slot) => {
    const item = items.get(itemId);
    const cost = stat(item?.cost ?? 0);
    return {
      id: `shop-buy-${slot}-${itemId}`,
      itemId,
      label: fitMenuLabel(`${resolveItemName(input, itemId, item)} ${cost}`),
      cost,
      price: sellPriceForItem(item ?? fallbackItem(itemId)),
      ownerChar
    };
  });
  const sellEntries = (input.partyState?.inventory?.(ownerChar) ?? member.inventory).map((itemId, slot) => {
    const item = items.get(itemId);
    const price = sellPriceForItem(item ?? fallbackItem(itemId));
    return {
      id: `shop-sell-${slot}-${itemId}`,
      itemId,
      label: fitMenuLabel(`${resolveItemName(input, itemId, item)} ${price}`),
      cost: stat(item?.cost ?? 0),
      price,
      ownerChar,
      inventorySlot: slot
    };
  });
  return {
    storeId: stat(input.storeId),
    member: activeMemberView(member),
    wallet: stat(input.partyState?.wallet ?? input.wallet ?? 0),
    buyEntries,
    sellEntries,
    available: Boolean(shop)
  };
}

export function buildGoodsViewModel(input: PartyMenuViewModelInput = {}): GoodsViewModel {
  return buildGoodsViewModelForMember(input, activePartyMember(input));
}

function buildGoodsViewModelForMember(input: PartyMenuViewModelInput, member: PartyMember): GoodsViewModel {
  return {
    title: "Goods",
    member: activeMemberView(member),
    targets: selectedPartyMembers(input).map(activeMemberView),
    entries: inventoryEntries(input, member)
  };
}

export function buildEquipViewModel(input: PartyMenuViewModelInput = {}): EquipViewModel {
  return buildEquipViewModelForMember(input, activePartyMember(input));
}

function buildEquipViewModelForMember(input: PartyMenuViewModelInput, member: PartyMember): EquipViewModel {
  const equipped = input.partyState?.equipped?.(member.id) ?? {};
  const items = itemMap(input.items);
  const entries = inventoryEntries(input, member).filter((entry) => entry.equippable && entry.equipmentSlot);
  return {
    title: "Equip",
    member: activeMemberView(member),
    entries,
    slots: EQUIP_SLOTS.map((slot) => {
      const equippedItemId = equipped[slot];
      const equippedItem = equippedItemId !== undefined ? items.get(equippedItemId) : undefined;
      return {
        slot,
        label: equipmentSlotLabel(slot),
        equippedLabel: equippedItemId !== undefined ? resolveItemName(input, equippedItemId, equippedItem) : "-",
        screenId: equipSlotScreenId(member.id, slot),
        entries: entries.filter((entry) => entry.equipmentSlot === slot)
      };
    })
  };
}

export function buildPsiViewModel(input: PartyMenuViewModelInput = {}): PsiViewModel {
  return buildPsiViewModelForMember(input, activePartyMember(input));
}

function buildPsiViewModelForMember(input: PartyMenuViewModelInput, member: PartyMember): PsiViewModel {
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

function buildPartyMemberSelectScreen(
  id: string,
  title: string,
  members: Array<{ name: string }>
): MenuScreen {
  return {
    id,
    title,
    items: members.map((member, index) => ({
      id: `${id}-select-${index}`,
      label: member.name,
      enabled: true,
      childScreenId: partyMemberScreenId(id, index)
    })),
    wrap: false
  };
}

function partyMemberScreenId(rootId: string, index: number): string {
  return `${rootId}-member-${stat(index)}`;
}

function equipSlotScreenId(memberId: number, slot: EquipmentSlot): string {
  return `equip-slot-${stat(memberId)}-${slot}`;
}

export function buildStatusScreen(status: StatusViewModel): MenuScreen {
  return buildPartyMemberSelectScreen(STATUS_MENU_ID, status.title, status.members);
}

export function buildStatusMemberScreens(status: StatusViewModel): MenuScreen[] {
  return status.members.map((member, index) => ({
    id: statusMemberScreenId(index),
    title: status.title,
    items: statusMemberItems(member),
    wrap: false
  }));
}

export function buildGoodsScreen(goods: GoodsViewModel, id = GOODS_MENU_ID): MenuScreen {
  return {
    id,
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

export function buildEquipScreen(equip: EquipViewModel, id = EQUIP_MENU_ID): MenuScreen {
  return {
    id,
    title: equip.title,
    items: equip.slots.map((slot) => ({
      id: `equip-slot-${equip.member.id}-${slot.slot}`,
      label: fitMenuLabel(`${slot.label}: ${slot.equippedLabel}`),
      enabled: true,
      childScreenId: slot.screenId
    })),
    wrap: false
  };
}

export function buildEquipSlotScreens(equip: EquipViewModel): MenuScreen[] {
  return equip.slots.map((slot) => ({
    id: slot.screenId,
    title: slot.label,
    items: slot.entries.length > 0
      ? slot.entries.map((entry) => ({
          id: `equip-${entry.slot}-${entry.itemId}`,
          label: fitMenuLabel([
            entry.equipped ? "Eq" : "",
            entry.label
          ].filter(Boolean).join(" ")),
          enabled: true,
          childScreenId: entry.equipActionScreenId
        }))
      : [{ id: `equip-empty-${equip.member.id}-${slot.slot}`, label: "Nothing to equip.", enabled: false }],
    wrap: false
  }));
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

export function buildPsiScreen(psi: PsiViewModel, id = PSI_MENU_ID): MenuScreen {
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
    id,
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

function statusMemberScreenId(index: number): string {
  return partyMemberScreenId(STATUS_MENU_ID, index);
}

function statusMemberItems(member: StatusMemberViewModel): MenuItem[] {
  return [
    { id: "name-level", label: fitMenuLabel(`${member.name} Lv ${member.level}`), enabled: false },
    { id: "hp-pp", label: `HP ${member.hp}/${member.maxHp} PP ${member.pp}/${member.maxPp}`, enabled: false },
    { id: "condition", label: fitMenuLabel(`Cond ${formatStatusAilments(member.statuses)}`), enabled: false },
    { id: "exp", label: `EXP ${member.experience}`, enabled: false },
    { id: "offense-defense", label: `Offense ${member.stats.offense} Defense ${member.stats.defense}`, enabled: false },
    { id: "speed-guts", label: `Speed ${member.stats.speed} Guts ${member.stats.guts}`, enabled: false },
    { id: "luck-vitality", label: `Luck ${member.stats.luck} Vitality ${member.stats.vitality}`, enabled: false },
    { id: "iq", label: `IQ ${member.stats.iq}`, enabled: false }
  ];
}

export function resolveTalkMenuAction(input: { hasInteractionTarget: boolean; dialogueCanOpen: boolean }): TalkMenuDecision {
  if (!input.hasInteractionTarget) {
    return { kind: "message", message: NO_ONE_TO_TALK_TO_MESSAGE };
  }
  if (!input.dialogueCanOpen) {
    return { kind: "close" };
  }
  return { kind: "openDialogue" };
}

export function buildShopMenuScreens(shop: ShopViewModel): MenuScreen[] {
  return [
    {
      id: shopRootScreenId(shop.storeId),
      title: "Shop",
      items: [
        { id: `shop-wallet-${shop.storeId}`, label: `$swag ${shop.wallet}`, enabled: false },
        { id: `shop-buy-${shop.storeId}`, label: "Buy", enabled: shop.available, childScreenId: shopBuyScreenId(shop.storeId) },
        { id: `shop-sell-${shop.storeId}`, label: "Sell", enabled: true, childScreenId: shopSellScreenId(shop.storeId) },
        { id: `shop-cancel-${shop.storeId}`, label: "Cancel", enabled: true, actionId: SHOP_CANCEL_ACTION_ID }
      ],
      wrap: false
    },
    {
      id: shopBuyScreenId(shop.storeId),
      title: "Buy",
      items: shop.available && shop.buyEntries.length > 0
        ? shop.buyEntries.map((entry) => ({
            id: entry.id,
            label: entry.label,
            enabled: true,
            actionId: buildShopBuyActionId(shop.storeId, entry.ownerChar, entry.itemId)
          }))
        : [{ id: `shop-buy-empty-${shop.storeId}`, label: "No goods.", enabled: false }],
      wrap: false
    },
    {
      id: shopSellScreenId(shop.storeId),
      title: "Sell",
      items: shop.sellEntries.length > 0
        ? shop.sellEntries.map((entry) => ({
            id: entry.id,
            label: entry.label,
            enabled: true,
            actionId: buildShopSellActionId(
              shop.storeId,
              entry.ownerChar,
              entry.inventorySlot ?? 0,
              entry.itemId
            )
          }))
        : [{ id: `shop-sell-empty-${shop.storeId}`, label: "No goods.", enabled: false }],
      wrap: false
    }
  ];
}

export function buildAtmScreen(input: StatusViewModelInput = {}): MenuScreen {
  const wallet = stat(input.partyState?.wallet ?? input.wallet ?? 0);
  const bank = stat(input.partyState?.bank ?? 0);
  return {
    id: ATM_MENU_ID,
    title: "ATM",
    items: [
      { id: "atm-wallet", label: `$swag ${wallet}`, enabled: false },
      { id: "atm-bank", label: `Bank ${bank}`, enabled: false },
      { id: "atm-deposit-100", label: `Deposit ${ATM_DEBUG_AMOUNT}`, enabled: wallet > 0, actionId: buildAtmActionId("deposit", ATM_DEBUG_AMOUNT) },
      { id: "atm-withdraw-100", label: `Withdraw ${ATM_DEBUG_AMOUNT}`, enabled: bank > 0, actionId: buildAtmActionId("withdraw", ATM_DEBUG_AMOUNT) },
      { id: "atm-deposit-all", label: "Deposit All", enabled: wallet > 0, actionId: buildAtmActionId("deposit") },
      { id: "atm-withdraw-all", label: "Withdraw All", enabled: bank > 0, actionId: buildAtmActionId("withdraw") }
    ],
    wrap: false
  };
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

export function buildShopBuyActionId(storeId: number, char: number, itemId: number): string {
  return [SHOP_BUY_ACTION_PREFIX, stat(storeId), stat(char), stat(itemId)].join(":");
}

export function buildShopSellActionId(storeId: number, char: number, inventorySlot: number, itemId: number): string {
  return [SHOP_SELL_ACTION_PREFIX, stat(storeId), stat(char), stat(inventorySlot), stat(itemId)].join(":");
}

export function buildAtmActionId(op: "deposit" | "withdraw", amount?: number): string {
  return [ATM_ACTION_PREFIX, op, amount === undefined ? "all" : stat(amount)].join(":");
}

export function shopRootScreenId(storeId: number): string {
  return `shop-${stat(storeId)}`;
}

function shopBuyScreenId(storeId: number): string {
  return `shop-${stat(storeId)}-buy`;
}

function shopSellScreenId(storeId: number): string {
  return `shop-${stat(storeId)}-sell`;
}

export function parseMenuAction(actionId: string): MenuAction | undefined {
  if (actionId === SAVE_MENU_ACTION_ID) {
    return { kind: "save" };
  }
  if (actionId === SHOP_CANCEL_ACTION_ID) {
    return { kind: "shopCancel" };
  }
  const [prefix, ...rawParts] = actionId.split(":");
  if (prefix === ATM_ACTION_PREFIX && rawParts.length === 2) {
    const op = rawParts[0] === "deposit" || rawParts[0] === "withdraw" ? rawParts[0] : undefined;
    if (!op) {
      return undefined;
    }
    if (rawParts[1] === "all") {
      return { kind: "atm", op, all: true };
    }
    const amount = Number(rawParts[1]);
    return Number.isInteger(amount) && amount >= 0 ? { kind: "atm", op, amount, all: false } : undefined;
  }
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
  if (prefix === SHOP_BUY_ACTION_PREFIX && parts.length === 3) {
    const [storeId, char, itemId] = parts;
    return { kind: "shopBuy", storeId, char, itemId };
  }
  if (prefix === SHOP_SELL_ACTION_PREFIX && parts.length === 4) {
    const [storeId, char, inventorySlot, itemId] = parts;
    return { kind: "shopSell", storeId, char, inventorySlot, itemId };
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

function fallbackItem(itemId: number): Pick<ItemData, "id" | "cost"> {
  return { id: itemId, cost: 0 };
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

function refreshedCursorIndex(screen: MenuScreen, previousIndex: number): number {
  if (screen.items.length === 0) {
    return -1;
  }
  const boundedIndex = clamp(previousIndex, 0, screen.items.length - 1);
  if (screen.items[boundedIndex]?.enabled) {
    return boundedIndex;
  }
  const firstEnabled = screen.items.findIndex((item) => item.enabled);
  return firstEnabled >= 0 ? firstEnabled : boundedIndex;
}

function neutralPartyMember(): PartyMember {
  return {
    id: 0,
    name: "PLAYER",
    level: 1,
    experience: 0,
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
