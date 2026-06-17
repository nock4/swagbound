import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ItemCollectionSchema,
  PsiCollectionSchema,
  SCHEMA_VERSION,
  type ItemCollection,
  type ItemData,
  type PsiCollection,
  type ValidationIssue
} from "@eb/schemas";
import { parseIntKeyedYaml, parseYamlInteger } from "./coilsnakeYaml";

export const ITEMS_FILE = "items.json";
export const PSI_FILE = "psi.json";

const REQUIRED_INPUTS = [
  "item_configuration_table.yml",
  "psi_ability_table.yml",
  "psi_name_table.yml"
] as const;
const BATTLE_ACTIONS_FILE = "battle_action_table.yml";
const CONDIMENTS_FILE = "condiment_table.yml";

const PSI_LEARN_CHARACTER_SLOTS = [0, 1, 3] as const;
const FOOD_AND_DRINK_ROUTINE_ADDRESS = 0xc2b27d;
const HP_FOOD_RECOVERY_MULTIPLIER = 3;
const PP_FOOD_RECOVERY_DIVISOR = 2;

const DRINK_EFFECTS_BY_HELP_POINTER = new Map<number, ItemUseEffectData>([
  [0xc545a1, { kind: "healHp", amount: 6 }],
  [0xc54733, { kind: "recoverPp", amount: 10 }],
  [0xc561ff, { kind: "healHp", amount: 12 }]
]);

type ItemPsiBuildOptions = {
  projectAbs: string;
  displayPath: string;
};

type ItemConfigEntry = {
  id: number;
  fields: Record<string, string>;
  miscFlags: string[];
};

type ItemUseEffectData = NonNullable<ItemData["effect"]>;

export async function buildItemPsiData(options: ItemPsiBuildOptions): Promise<{
  items: ItemCollection;
  psi: PsiCollection;
}> {
  assertInputs(options.projectAbs);

  const itemRows = parseItemConfiguration(
    await readFile(path.join(options.projectAbs, "item_configuration_table.yml"), "utf8")
  );
  const battleActions = await readOptionalIntKeyedYaml(options.projectAbs, BATTLE_ACTIONS_FILE);
  const condimentEffects = await readCondimentEffects(options.projectAbs);
  const psiRows = parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "psi_ability_table.yml"), "utf8"));
  const psiNames = parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "psi_name_table.yml"), "utf8"));
  const warnings: ValidationIssue[] = [];

  const items = [...itemRows.values()]
    .sort((a, b) => a.id - b.id)
    .map((entry) => {
      const type = requiredInteger(entry.fields.Type, `item_configuration_table.yml Type for item ${entry.id}`);
      const action = requiredInteger(entry.fields.Action, `item_configuration_table.yml Action for item ${entry.id}`);
      const effect = itemUseEffectForEntry(entry, action, battleActions, condimentEffects);
      return {
        id: entry.id,
        name: entry.fields.Name ?? neutralName("item", entry.id),
        type,
        cost: requiredInteger(entry.fields.Cost, `item_configuration_table.yml Cost for item ${entry.id}`),
        action,
        argument: optionalInteger(entry.fields.Argument),
        equippable: isEquippableType(type),
        miscFlags: entry.miscFlags,
        ...(effect ? { effect } : {})
      };
    });

  const learnColumns = discoverLearnColumns(psiRows);
  if (learnColumns.length > PSI_LEARN_CHARACTER_SLOTS.length) {
    warnings.push(issue(
      "warning",
      "psi_learn_columns_extra",
      `PSI learn table exposes ${learnColumns.length} learn columns; only known character slots were mapped.`,
      "psi_ability_table.yml"
    ));
  }

  const psi = [...psiRows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, entry]) => {
      const nameId = parseYamlInteger(entry["PSI Name"]);
      const name = Number.isFinite(nameId)
        ? psiNames.get(nameId)?.Name ?? neutralName("psi", id)
        : neutralName("psi", id);
      return {
        id,
        name,
        type: entry.Type ?? "",
        strength: entry.Strength ?? "",
        usableOutsideBattle: usableOutsideBattle(entry["Usability Outside of Battle"]),
        learnedBy: learnColumns.flatMap((column, index) => {
          const charId = PSI_LEARN_CHARACTER_SLOTS[index];
          if (charId === undefined) {
            return [];
          }
          const level = parseYamlInteger(entry[column]);
          return Number.isFinite(level) && level > 0 ? [{ charId, level }] : [];
        })
      };
    });

  return {
    items: ItemCollectionSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      sourceProjectPath: options.displayPath,
      derivation: {
        source: "item_configuration_table.yml provides item names and numeric metadata; nested Misc Flags list entries are preserved as strings.",
        equippable: "Item Type values in the 0x10-0x1f equipment range are marked equippable; equip effects and slot state are deferred.",
        helpText: "The current CoilSnake table exposes help-text pointers, not decoded help text; runtime Check screens use generated helpText when present and neutral placeholders otherwise."
      },
      items,
      counts: {
        items: items.length,
        equippable: items.filter((item) => item.equippable).length
      },
      warnings
    }),
    psi: PsiCollectionSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      sourceProjectPath: options.displayPath,
      derivation: {
        source: "psi_ability_table.yml provides PSI rows; psi_name_table.yml resolves PSI name ids.",
        names: "Rows with non-numeric PSI Name values use neutral runtime placeholders.",
        learnedBy: "Learn-level columns are mapped by table order to character slots 0, 1, and 3; copyrighted column labels are not used as ids.",
        usableOutsideBattle: "Usability text is normalized to true only for values that explicitly mention outside/field/both/all usage or boolean true."
      },
      psi,
      counts: {
        psi: psi.length,
        learnedBy: psi.reduce((total, item) => total + item.learnedBy.length, 0)
      },
      warnings
    })
  };
}

function assertInputs(projectAbs: string): void {
  for (const relativePath of REQUIRED_INPUTS) {
    if (!existsSync(path.join(projectAbs, relativePath))) {
      throw new Error(`Item/PSI extraction requires ${relativePath}.`);
    }
  }
}

async function readOptionalIntKeyedYaml(projectAbs: string, relativePath: string) {
  const fullPath = path.join(projectAbs, relativePath);
  return existsSync(fullPath) ? parseIntKeyedYaml(await readFile(fullPath, "utf8")) : undefined;
}

async function readCondimentEffects(projectAbs: string): Promise<Map<number, ItemUseEffectData>> {
  const rows = await readOptionalIntKeyedYaml(projectAbs, CONDIMENTS_FILE);
  const effects = new Map<number, ItemUseEffectData>();
  for (const entry of rows?.values() ?? []) {
    const food = parseYamlInteger(entry.food);
    const goodRecover = parseYamlInteger(entry["good recover"]);
    if (!Number.isFinite(food) || food <= 0 || !Number.isFinite(goodRecover) || goodRecover <= 0) {
      continue;
    }

    const effect = entry.effect?.trim().toLowerCase();
    if (effect === "restore hp") {
      effects.set(food, { kind: "healHp", amount: goodRecover * HP_FOOD_RECOVERY_MULTIPLIER });
    } else if (effect === "restore pp") {
      effects.set(food, { kind: "recoverPp", amount: Math.max(1, Math.floor(goodRecover / PP_FOOD_RECOVERY_DIVISOR)) });
    }
  }
  return effects;
}

function itemUseEffectForEntry(
  entry: ItemConfigEntry,
  action: number,
  battleActions: ReturnType<typeof parseIntKeyedYaml> | undefined,
  condimentEffects: Map<number, ItemUseEffectData>
): ItemUseEffectData | undefined {
  if (!usesFoodAndDrinkRoutine(action, battleActions)) {
    return undefined;
  }
  const condimentEffect = condimentEffects.get(entry.id);
  if (condimentEffect) {
    return condimentEffect;
  }
  const helpPointer = parsePointerInteger(entry.fields["Help Text Pointer"]);
  return Number.isFinite(helpPointer) ? DRINK_EFFECTS_BY_HELP_POINTER.get(helpPointer) : undefined;
}

function usesFoodAndDrinkRoutine(action: number, battleActions: ReturnType<typeof parseIntKeyedYaml> | undefined): boolean {
  const row = battleActions?.get(action);
  if (!row) {
    return false;
  }
  const actionType = row["Action type"]?.trim().toLowerCase();
  const direction = row.Direction?.trim().toLowerCase();
  return actionType === "item" &&
    direction === "party" &&
    parseYamlInteger(row["Code Address"]) === FOOD_AND_DRINK_ROUTINE_ADDRESS;
}

function parsePointerInteger(value: string | undefined): number {
  const direct = parseYamlInteger(value);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const labelMatch = /(?:^|[._])l_0x([0-9a-f]+)$/i.exec(value?.trim() ?? "");
  return labelMatch ? Number.parseInt(labelMatch[1], 16) : Number.NaN;
}

function parseItemConfiguration(source: string): Map<number, ItemConfigEntry> {
  const entries = new Map<number, ItemConfigEntry>();
  let current: ItemConfigEntry | undefined;
  let collectingMiscFlags = false;

  for (const line of source.split(/\r?\n/)) {
    const blockMatch = /^(0x[0-9a-fA-F]+|\$[0-9a-fA-F]+|\d+):\s*$/.exec(line);
    if (blockMatch) {
      current = {
        id: parseYamlInteger(blockMatch[1]),
        fields: {},
        miscFlags: []
      };
      entries.set(current.id, current);
      collectingMiscFlags = false;
      continue;
    }
    if (!current) {
      continue;
    }

    const fieldMatch = /^ {2}([^:]+):\s*(.*)$/.exec(line);
    if (fieldMatch && !line.startsWith("   ")) {
      const key = fieldMatch[1].trim();
      current.fields[key] = stripQuotes(fieldMatch[2].trim());
      collectingMiscFlags = key === "Misc Flags";
      continue;
    }

    const listMatch = /^ {2}-\s*(.*)$/.exec(line);
    if (collectingMiscFlags && listMatch) {
      current.miscFlags.push(stripQuotes(listMatch[1].trim()));
    }
  }

  return entries;
}

function discoverLearnColumns(rows: ReturnType<typeof parseIntKeyedYaml>): string[] {
  const columns: string[] = [];
  for (const entry of rows.values()) {
    for (const key of Object.keys(entry)) {
      if (key.startsWith("Level learned by ") && !columns.includes(key)) {
        columns.push(key);
      }
    }
  }
  return columns;
}

function isEquippableType(type: number): boolean {
  return type >= 0x10 && type <= 0x1f;
}

function usableOutsideBattle(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (/^(?:1|true|yes)$/.test(normalized)) {
    return true;
  }
  if (/^(?:0|false|no|none|null)$/.test(normalized)) {
    return false;
  }
  return /\b(?:outside|field|both|all)\b/.test(normalized);
}

function requiredInteger(value: string | undefined, field: string): number {
  const parsed = parseYamlInteger(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid or missing numeric item/PSI field "${field}".`);
  }
  return Math.max(0, Math.floor(parsed));
}

function optionalInteger(value: string | undefined): number {
  const parsed = parseYamlInteger(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function neutralName(kind: "item" | "psi", id: number): string {
  return `[${kind} ${id}]`;
}

function stripQuotes(value: string): string {
  const match = /^"(.*)"$|^'(.*)'$/.exec(value);
  if (match) {
    return match[1] ?? match[2] ?? value;
  }
  return value;
}

function issue(severity: ValidationIssue["severity"], code: string, message: string, issuePath?: string): ValidationIssue {
  return { severity, code, message, ...(issuePath ? { path: issuePath } : {}) };
}
