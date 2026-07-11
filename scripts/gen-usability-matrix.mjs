#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ITEMS_PATH = "apps/game/public/generated/items.json";
const PSI_PATH = "apps/game/public/generated/psi.json";
const ITEM_OVERRIDES_PATH = "content/item-overrides.json";
const PSI_OVERRIDES_PATH = "content/psi-overrides.json";
const KEY_ITEMS_PATH = "content/key-items.json";
const BATTLE_ACTIONS_PATH = "external/coilsnake-full/battle_action_table.yml";
const CONTENT_OUT = "content/usability-matrix.json";
const GENERATED_OUT = "apps/game/public/generated/usability-matrix.json";

export const ITEM_TYPE_CONTEXTS = [
  typeContext(0, "special passive", false, false, false, true, "Passive or special inventory item. Not command-usable."),
  typeContext(4, "battle companion", false, false, false, false, "Teddy-bear class. Passive battle companion, not command-usable."),
  typeContext(8, "broken repair goods", false, false, false, false, "Broken Jeff repair goods. Inert from Use."),
  typeContext(16, "weapon", false, false, true, false, "Weapon equipment. Equip-only."),
  typeContext(17, "weapon", false, false, true, false, "Weapon equipment. Equip-only."),
  typeContext(20, "body equipment", false, false, true, false, "Body equipment. Equip-only."),
  typeContext(24, "arms equipment", false, false, true, false, "Arms equipment. Equip-only."),
  typeContext(28, "other equipment", false, false, true, false, "Other equipment. Equip-only."),
  typeContext(32, "food", true, true, false, false, "Food and PP sweets. Field and battle consumable."),
  typeContext(36, "drink or remedy", true, true, false, false, "Drinks, remedies, capsules, and soups. Field and battle consumable."),
  typeContext(40, "condiment", true, true, false, false, "Condiment class. Field and battle consumable."),
  typeContext(44, "party food", true, true, false, false, "Large food class. Field and battle consumable."),
  typeContext(48, "status healer", true, true, false, false, "Status cure, revive, and recovery class. Field and battle usable."),
  typeContext(52, "battle tool", false, true, false, false, "Battle-only offensive tool class."),
  typeContext(53, "battle support tool", false, true, false, false, "Battle-only support or special tool class."),
  typeContext(56, "field tool", true, false, false, false, "Field-only tool class."),
  typeContext(58, "field traversal tool", true, false, false, false, "Field-only traversal or trap tool class."),
  typeContext(59, "story key item", false, false, false, true, "Story key item class. Inert from Use."),
  typeContext(255, "null", false, false, false, false, "Null placeholder. Not command-usable.")
];

const ITEM_TYPE_CONTEXT_BY_TYPE = new Map(ITEM_TYPE_CONTEXTS.map((entry) => [entry.type, entry]));

function typeContext(type, label, fieldUse, battleUse, equippable, keyItem, summary) {
  return { type, label, fieldUse, battleUse, equippable, keyItem, summary };
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

export async function buildUsabilityMatrix() {
  const [itemCollection, psiCollection, itemOverrides, psiOverrides, keyItems, battleActions] = await Promise.all([
    readJson(ITEMS_PATH),
    readJson(PSI_PATH),
    readJson(ITEM_OVERRIDES_PATH),
    readJson(PSI_OVERRIDES_PATH),
    readJson(KEY_ITEMS_PATH),
    readText(BATTLE_ACTIONS_PATH).then(parseIntKeyedYaml)
  ]);
  return buildUsabilityMatrixFromData({
    itemCollection,
    psiCollection,
    itemOverrides,
    psiOverrides,
    keyItems,
    battleActions
  });
}

export function buildUsabilityMatrixFromData(input) {
  const itemOverrideMap = input.itemOverrides?.byItemId ?? {};
  const psiOverrideMap = input.psiOverrides?.byPsiId ?? {};
  const contentKeyIds = new Set(input.keyItems?.itemIds ?? []);
  const items = (input.itemCollection?.items ?? [])
    .map((item) => applyItemOverride(item, itemOverrideMap[String(item.id)]))
    .map((item) => itemRow(item, input.battleActions, contentKeyIds));
  const psi = (input.psiCollection?.psi ?? [])
    .map((entry) => applyPsiOverride(entry, psiOverrideMap[String(entry.id)]))
    .map((entry) => psiRow(entry));

  return {
    schema: "swagbound.usability-matrix.v1",
    generatedFrom: {
      items: ITEMS_PATH,
      psi: PSI_PATH,
      itemOverrides: ITEM_OVERRIDES_PATH,
      psiOverrides: PSI_OVERRIDES_PATH,
      keyItems: KEY_ITEMS_PATH,
      battleActions: BATTLE_ACTIONS_PATH,
      derivation: "Item Type selects field, battle, equip, and key-item context. Item effect metadata supplies target side and feedback summary. PSI type, direction, name, and PP cost select field and battle context."
    },
    itemTypeContexts: ITEM_TYPE_CONTEXTS,
    items,
    psi
  };
}

function applyItemOverride(item, override) {
  if (!override) {
    return { ...item };
  }
  return {
    ...item,
    ...(override.name ? { name: override.name } : {}),
    ...(override.effect ? { effect: override.effect } : {})
  };
}

function applyPsiOverride(psi, override) {
  if (!override) {
    return { ...psi };
  }
  return {
    ...psi,
    ...(override.name ? { name: override.name } : {}),
    ...(override.effect ? { effect: override.effect } : {}),
    ...(override.learnedBy ? { learnedBy: override.learnedBy.map((entry) => ({ ...entry })) } : {})
  };
}

function itemRow(item, battleActions, contentKeyIds) {
  const context = ITEM_TYPE_CONTEXT_BY_TYPE.get(item.type) ?? typeContext(item.type, "unknown", false, false, false, false, "Unknown item type. Treated as inert.");
  const effect = item.effect;
  const battleAction = battleActions.get(item.action);
  const targets = [];
  if (context.fieldUse) {
    targets.push(fieldItemTarget(effect, context));
  }
  if (context.battleUse) {
    targets.push(battleActionTarget(battleAction, effect));
  }
  const keyItem = context.keyItem || contentKeyIds.has(item.id);
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    fieldUse: context.fieldUse,
    battleUse: context.battleUse,
    equippable: context.equippable || Boolean(item.equippable),
    keyItem,
    targets: unique(targets),
    effectSummary: effectSummary(effect, battleAction),
    useVerb: itemUseVerb(item)
  };
}

function psiRow(psi) {
  const kind = psiKind(psi);
  const teleport = isTeleportPsi(psi);
  const partyRecovery = kind === "recovery" && psi.direction !== "enemy" && !/magnet/i.test(psi.name);
  const placeholder = !psi.name.trim() || /^\[psi\s+\d+\]$/i.test(psi.name.trim()) || /\?\?\?\?/.test(psi.name);
  const fieldUse = !placeholder && (teleport || partyRecovery);
  const battleUse = !placeholder && !teleport && (kind === "offense" || kind === "recovery" || kind === "assist" || Boolean(psi.effect));
  const targets = [];
  if (fieldUse) {
    targets.push(teleport ? "field:teleport" : psiTarget("field", psi.direction ?? "party", psi.target ?? "one"));
  }
  if (battleUse) {
    targets.push(psiTarget("battle", psi.direction ?? (kind === "offense" ? "enemy" : "party"), psi.target ?? "one"));
  }
  return {
    id: psi.id,
    name: psi.name,
    fieldUse,
    battleUse,
    targets: unique(targets),
    ppCost: integer(psi.ppCost)
  };
}

function fieldItemTarget(effect, context) {
  if (!effect) {
    return `field:${context.label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "tool"}`;
  }
  return `field:${itemEffectSide(effect)}:${effect.kind === "revive" ? "fainted-one" : "one"}`;
}

function battleActionTarget(action, effect) {
  const direction = normalizeDirection(action?.Direction) ?? itemEffectSide(effect);
  const target = normalizeTarget(action?.Target);
  return `battle:${direction}:${target}`;
}

function psiTarget(context, direction, target) {
  return `${context}:${normalizeDirection(direction) ?? "party"}:${normalizeTarget(target)}`;
}

function itemEffectSide(effect) {
  if (!effect) {
    return "party";
  }
  if (effect.kind === "damage" || effect.kind === "drainPp") {
    return "enemy";
  }
  if (effect.kind === "inflictStatus") {
    return effect.ailment === "shielded" ? "party" : "enemy";
  }
  if (effect.kind === "buffStat") {
    return (effect.amount ?? 0) < 0 ? "enemy" : "party";
  }
  return "party";
}

function effectSummary(effect, action) {
  if (effect) {
    switch (effect.kind) {
      case "healHp":
        return `healHp ${integer(effect.amount)}`;
      case "healHpPercent":
        return `healHpPercent ${integer(effect.percent)}`;
      case "recoverPp":
        return `recoverPp ${integer(effect.amount)}`;
      case "recoverPpPercent":
        return `recoverPpPercent ${integer(effect.percent)}`;
      case "damage":
        return `damage ${integer(effect.amount)}`;
      case "drainPp":
        return `drainPp ${integer(effect.amount)}`;
      case "buffStat":
        return `buffStat ${effect.stat}${effect.amount !== undefined ? ` ${effect.amount}` : ""}${effect.multiplier !== undefined ? ` x${effect.multiplier}` : ""}`;
      case "permStat":
        return `permStat ${effect.stat} ${effect.amount}`;
      case "revive":
        return `revive ${integer(effect.amount)}`;
      case "cureStatus":
        return `cureStatus ${effect.ailment}`;
      case "inflictStatus":
        return `inflictStatus ${effect.ailment}`;
    }
  }
  const actionType = action?.["Action type"]?.trim();
  if (actionType) {
    return `action ${actionType}`;
  }
  return "none";
}

function itemUseVerb(item) {
  if (item.type === 32 || item.type === 40 || item.type === 44) {
    return "ate";
  }
  if (item.type === 36 || /\b(?:water|juice|tea|drink|coffee|soup)\b/i.test(item.name)) {
    return "drank";
  }
  return "used";
}

function psiKind(psi) {
  const tokens = new Set(String(psi.type ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean));
  if (tokens.has("offense")) {
    return "offense";
  }
  if (tokens.has("recovery") || tokens.has("recover")) {
    return "recovery";
  }
  if (tokens.has("assist")) {
    return "assist";
  }
  if (tokens.has("other")) {
    return "other";
  }
  return "unknown";
}

function isTeleportPsi(psi) {
  return /\bteleport\b/i.test(psi.name) || integer(psi.id) === 51 || integer(psi.id) === 52;
}

function normalizeDirection(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "enemy" ? "enemy" : normalized === "party" ? "party" : undefined;
}

function normalizeTarget(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "all" || normalized === "row" || normalized === "none" || normalized === "fainted-one") {
    return normalized;
  }
  return "one";
}

function integer(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseIntKeyedYaml(source) {
  const entries = new Map();
  let currentId = null;
  for (const line of source.split(/\r?\n/)) {
    const blockMatch = /^(0x[0-9a-fA-F]+|\$[0-9a-fA-F]+|\d+):\s*$/.exec(line);
    if (blockMatch) {
      currentId = parseYamlInteger(blockMatch[1]);
      entries.set(currentId, {});
      continue;
    }
    if (currentId === null) {
      continue;
    }
    const fieldMatch = /^ {2}([^:]+):\s*(.*)$/.exec(line);
    if (!fieldMatch) {
      continue;
    }
    entries.get(currentId)[fieldMatch[1].trim()] = stripQuotes(fieldMatch[2].trim());
  }
  return entries;
}

function parseYamlInteger(value) {
  const text = String(value ?? "").trim();
  if (/^\$[0-9a-f]+$/i.test(text)) {
    return Number.parseInt(text.slice(1), 16);
  }
  if (/^0x[0-9a-f]+$/i.test(text)) {
    return Number.parseInt(text.slice(2), 16);
  }
  if (/^\d+$/.test(text)) {
    return Number.parseInt(text, 10);
  }
  return Number.NaN;
}

function stripQuotes(value) {
  const match = /^"(.*)"$|^'(.*)'$/.exec(value);
  return match ? match[1] ?? match[2] ?? value : value;
}

async function writeMatrix() {
  const matrix = await buildUsabilityMatrix();
  const text = `${JSON.stringify(matrix, null, 2)}\n`;
  for (const relativePath of [CONTENT_OUT, GENERATED_OUT]) {
    const target = path.join(ROOT, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text, "utf8");
  }
  console.log(`Wrote ${CONTENT_OUT} and ${GENERATED_OUT} (${matrix.items.length} items, ${matrix.psi.length} psi).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeMatrix();
}
