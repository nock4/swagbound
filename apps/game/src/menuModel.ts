import type { CharacterCollection } from "@eb/schemas";
import { buildPartyMember, type PartyMember, type PartyMemberStats } from "./characterModel";

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
  };
  wallet?: number;
};

export const MAIN_MENU_ID = "main";
export const STATUS_MENU_ID = "status";

const MAIN_COMMANDS: Array<{ id: string; label: string; childScreenId: string }> = [
  { id: "talk", label: "Talk", childScreenId: "talk" },
  { id: "goods", label: "Goods", childScreenId: "goods" },
  { id: "psi", label: "PSI", childScreenId: "psi" },
  { id: STATUS_MENU_ID, label: "Status", childScreenId: STATUS_MENU_ID },
  { id: "equip", label: "Equip", childScreenId: "equip" },
  { id: "check", label: "Check", childScreenId: "check" }
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

export function buildMenuScreens(status: StatusViewModel): MenuScreen[] {
  return [
    buildMainMenuScreen(),
    buildPlaceholderScreen("talk", "Talk"),
    buildPlaceholderScreen("goods", "Goods"),
    buildPlaceholderScreen("psi", "PSI"),
    buildStatusScreen(status),
    buildPlaceholderScreen("equip", "Equip"),
    buildPlaceholderScreen("check", "Check")
  ];
}

export function buildStatusViewModel(input: StatusViewModelInput = {}): StatusViewModel {
  const sessionPartyIds = input.partyState?.party() ?? [];
  const baseMembers = input.partyMembers ?? input.characters?.characters.map(buildPartyMember) ?? [];
  const selectedMembers = sessionPartyIds.length > 0
    ? sessionPartyIds
        .map((id) => baseMembers.find((member) => member.id === id))
        .filter((member): member is PartyMember => Boolean(member))
    : baseMembers;
  const members = selectedMembers.length > 0 ? selectedMembers : [neutralPartyMember()];
  return {
    title: "Status",
    wallet: stat(input.partyState?.wallet ?? input.wallet ?? 0),
    members: members.map((member) => ({
      id: member.id,
      name: member.name.trim() || "PLAYER",
      level: stat(member.level),
      hp: stat(member.hp),
      maxHp: stat(member.maxHp),
      pp: stat(member.pp),
      maxPp: stat(member.maxPp),
      stats: {
        offense: stat(member.stats.offense),
        defense: stat(member.stats.defense),
        speed: stat(member.stats.speed),
        guts: stat(member.stats.guts),
        vitality: stat(member.stats.vitality),
        iq: stat(member.stats.iq),
        luck: stat(member.stats.luck)
      }
    }))
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

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
