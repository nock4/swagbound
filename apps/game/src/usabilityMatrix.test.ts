import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UsabilityMatrixSchema, type UsabilityItemRow, type UsabilityPsiRow } from "@eb/schemas";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATRIX_PATH = path.resolve(__dirname, "../../../content/usability-matrix.json");
const matrix = UsabilityMatrixSchema.parse(JSON.parse(readFileSync(MATRIX_PATH, "utf8")));

function item(id: number): UsabilityItemRow {
  const row = matrix.items.find((entry) => entry.id === id);
  if (!row) {
    throw new Error(`Missing item ${id}`);
  }
  return row;
}

function psi(id: number): UsabilityPsiRow {
  const row = matrix.psi.find((entry) => entry.id === id);
  if (!row) {
    throw new Error(`Missing PSI ${id}`);
  }
  return row;
}

describe("usability matrix canonical mapping", () => {
  it("marks type 52 bottle rocket class items battle-only", () => {
    for (const row of [item(144), item(145)]) {
      expect(row.type).toBe(52);
      expect(row.fieldUse).toBe(false);
      expect(row.battleUse).toBe(true);
      expect(row.targets).toContain("battle:enemy:one");
      expect(row.effectSummary).toMatch(/^damage /);
    }
  });

  it("marks Teleport-class PSI field-only", () => {
    for (const row of [psi(51), psi(52)]) {
      expect(row.fieldUse).toBe(true);
      expect(row.battleUse).toBe(false);
      expect(row.targets).toEqual(["field:teleport"]);
    }
  });

  it("marks Route Roll both field and battle usable", () => {
    expect(item(103)).toMatchObject({
      fieldUse: true,
      battleUse: true,
      useVerb: "ate"
    });
  });

  it("marks equipment as equip-only", () => {
    expect(item(17)).toMatchObject({
      fieldUse: false,
      battleUse: false,
      equippable: true,
      keyItem: false
    });
  });

  it("marks key items inert", () => {
    expect(item(170)).toMatchObject({
      fieldUse: false,
      battleUse: false,
      equippable: false,
      keyItem: true
    });
  });

  it("marks status healers both field and battle usable", () => {
    expect(item(127)).toMatchObject({
      fieldUse: true,
      battleUse: true,
      effectSummary: "cureStatus poisoned"
    });
  });

  it("keeps food as the eat-verb field and battle class", () => {
    expect(item(88)).toMatchObject({
      fieldUse: true,
      battleUse: true,
      useVerb: "ate"
    });
  });

  it("marks PP items both field and battle usable", () => {
    expect(item(98)).toMatchObject({
      fieldUse: true,
      battleUse: true,
      useVerb: "ate"
    });
    expect(item(98).effectSummary).toMatch(/^recoverPp /);
  });

  it("marks revive items both field and battle usable", () => {
    expect(item(130)).toMatchObject({
      fieldUse: true,
      battleUse: true,
      effectSummary: "revive 9999"
    });
  });

  it("marks Shield PSI battle-only", () => {
    expect(psi(33)).toMatchObject({
      fieldUse: false,
      battleUse: true
    });
    expect(psi(33).targets).toContain("battle:party:one");
  });
});
