import type { OwnedMon } from "./monsModel";

export type MoveCard = {
  id: string;
  name: string;
  abilityId: string;
  element?: string;
  desc: string;
};

export const MOVE_CARDS: readonly MoveCard[] = [
  {
    id: "move-card-polite-sip",
    name: "Polite Sip",
    abilityId: "polite-sip",
    desc: "A tiny straw teaches the sort of sipping your mother would approve of."
  },
  {
    id: "move-card-small-mend",
    name: "Small Mend",
    abilityId: "small-mend",
    desc: "Fixes a friend with good intentions and tape from the junk drawer."
  },
  {
    id: "move-card-kind-word",
    name: "Kind Word",
    abilityId: "kind-word",
    desc: "One nice sentence puts a little extra muscle in somebody's turn."
  },
  {
    id: "move-card-mud-manners",
    name: "Mud Manners",
    abilityId: "mud-manners",
    element: "earth",
    desc: "Shows dirt how to land firmly without tracking through the house."
  },
  {
    id: "move-card-pan-lid-bash",
    name: "Pan Lid Bash",
    abilityId: "pan-lid-bash",
    element: "steel",
    desc: "Turns one kitchen noise into a perfectly respectable battle plan."
  },
  {
    id: "move-card-spare-spell",
    name: "Spare Spell",
    abilityId: "spare-spell",
    element: "arcana",
    desc: "A loose spell falls out of the card and insists it was extra."
  },
  {
    id: "move-card-prism-wink",
    name: "Prism Wink",
    abilityId: "prism-wink",
    element: "crystal",
    desc: "One colorful blink makes an enemy reconsider standing right there."
  },
  {
    id: "move-card-slime-handshake",
    name: "Slime Handshake",
    abilityId: "slime-handshake",
    element: "ooze",
    desc: "A damp agreement is still an agreement, especially when it hits."
  },
  {
    id: "move-card-polite-frost",
    name: "Polite Frost",
    abilityId: "polite-frost",
    element: "frost",
    desc: "Asks the room to cool down and somehow the enemy listens."
  },
  {
    id: "move-card-soot-sneeze",
    name: "Soot Sneeze",
    abilityId: "soot-sneeze",
    element: "ash",
    desc: "Teaches the nose-first way to share a campfire with an enemy."
  },
  {
    id: "move-card-rubber-rebound",
    name: "Rubber Rebound",
    abilityId: "rubber-rebound",
    element: "rubber",
    desc: "What goes bonk comes back with excellent timing."
  },
  {
    id: "move-card-grave-hush",
    name: "Grave Hush",
    abilityId: "grave-hush",
    element: "grave",
    desc: "The quiet from downstairs reminds an enemy to lower its voice."
  }
];

export function moveCardById(id: string): MoveCard | undefined {
  return MOVE_CARDS.find((card) => card.id === id);
}

export function canTeach(
  mon: OwnedMon,
  card: MoveCard,
  knownAbilityIds: readonly string[]
): { ok: boolean; reason?: "already-known" } {
  if (knownAbilityIds.includes(card.abilityId) || mon.inherited.includes(card.abilityId)) {
    return { ok: false, reason: "already-known" };
  }
  return { ok: true };
}

export function teachMoveCard(mon: OwnedMon, card: MoveCard): OwnedMon {
  const inherited = mon.inherited.includes(card.abilityId)
    ? [...mon.inherited]
    : [...mon.inherited, card.abilityId];
  return { ...mon, inherited };
}

export const ITEM_WORKS_CARD_OUTPUT: readonly string[] = [
  "move-card-polite-sip",
  "move-card-small-mend",
  "move-card-mud-manners",
  "move-card-pan-lid-bash",
  "move-card-spare-spell",
  "move-card-prism-wink",
  "move-card-slime-handshake",
  "move-card-polite-frost",
  "move-card-soot-sneeze",
  "move-card-rubber-rebound"
];
