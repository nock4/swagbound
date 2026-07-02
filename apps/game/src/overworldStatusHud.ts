import type { StatusState } from "./statusEffects";

export type OverworldStatusHudMember = {
  charId: number;
  name: string;
  hp: number;
  hpTarget: number;
  maxHp: number;
  pp: number;
  maxPp: number;
  statuses: StatusState;
  hpRolling: boolean;
  danger: boolean;
};

export type OverworldStatusHudView = {
  visible: boolean;
  dangerActive: boolean;
  poisonTicks: number;
  poisonHpLost: number;
  members: OverworldStatusHudMember[];
};
