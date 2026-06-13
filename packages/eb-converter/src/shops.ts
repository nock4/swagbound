import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SCHEMA_VERSION,
  ShopDataSchema,
  type ShopData
} from "@eb/schemas";
import { parseIntKeyedYaml, parseYamlInteger } from "./coilsnakeYaml";

export const SHOPS_FILE = "shops.json";

const STORE_TABLE_FILE = "store_table.yml";

type ShopBuildOptions = {
  projectAbs: string;
  displayPath: string;
};

export async function buildShopData(options: ShopBuildOptions): Promise<ShopData> {
  const file = path.join(options.projectAbs, STORE_TABLE_FILE);
  if (!existsSync(file)) {
    throw new Error(`Shop extraction requires ${STORE_TABLE_FILE}.`);
  }

  const rows = parseIntKeyedYaml(await readFile(file, "utf8"));
  const shops = [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, fields]) => ({
      id,
      itemIds: itemSlots(fields)
    }));

  return ShopDataSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: options.displayPath,
    derivation: {
      source: "store_table.yml provides numeric store ids and numeric item ids only.",
      slots: "Fields named Item N are sorted by N; item id 0 is treated as an empty shop slot.",
      unusedFields: "No non-item fields were present in the observed table shape; any unknown fields are ignored."
    },
    shops,
    counts: {
      shops: shops.length,
      entries: shops.reduce((total, shop) => total + shop.itemIds.length, 0)
    },
    warnings: []
  });
}

function itemSlots(fields: Record<string, string>): number[] {
  return Object.entries(fields)
    .map(([key, value]) => {
      const match = /^Item\s+(\d+)$/iu.exec(key);
      if (!match) {
        return undefined;
      }
      const itemId = parseYamlInteger(value);
      return Number.isFinite(itemId)
        ? { slot: Number.parseInt(match[1], 10), itemId }
        : undefined;
    })
    .filter((entry): entry is { slot: number; itemId: number } => Boolean(entry))
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => entry.itemId)
    .filter((itemId) => itemId > 0);
}
