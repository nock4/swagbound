export const FILING_INTAKE_REGISTRY_KEY = "filingIntake";

export type FilingIntakeValues = {
  name: string;
  interest: string;
  friend: string;
};

export type FilingIntakeFieldId = keyof FilingIntakeValues;

export type FilingIntakeField = {
  id: FilingIntakeFieldId;
  prompt: string;
  maxLength: number;
  defaults: readonly string[];
};

export const FILING_INTAKE_FIELDS: readonly FilingIntakeField[] = [
  {
    id: "name",
    prompt: "State your name for the record.",
    maxLength: 10,
    defaults: ["BOSCH", "LEDGER", "KIOSK", "CLAIM"]
  },
  {
    id: "interest",
    prompt: "Declare one interest. It will be filed.",
    maxLength: 10,
    defaults: ["MUSIC", "FORMS", "STATIC", "CODES"]
  },
  {
    id: "friend",
    prompt: "Name a friend you have not met yet.",
    maxLength: 10,
    defaults: ["CLOAK", "WITNESS", "STAMP", "UNKNOWN"]
  }
];

export type FilingGridItem =
  | { kind: "character"; label: string; value: string }
  | { kind: "space"; label: string }
  | { kind: "backspace"; label: string }
  | { kind: "ok"; label: string }
  | { kind: "dontCare"; label: string };

export type FilingGridDirection = "left" | "right" | "up" | "down";

export type FilingEditResult = {
  value: string;
  defaultIndex: number;
  complete: boolean;
};

export const FILING_GRID_COLUMNS = 6;

export const FILING_GRID_ITEMS: readonly FilingGridItem[] = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => ({ kind: "character" as const, label: letter, value: letter })),
  { kind: "space", label: "SPACE" },
  { kind: "backspace", label: "BACK" },
  { kind: "ok", label: "OK" },
  { kind: "dontCare", label: "DON'T CARE" }
];

export function moveFilingGridCursor(index: number, direction: FilingGridDirection): number {
  const count = FILING_GRID_ITEMS.length;
  if (count === 0) {
    return 0;
  }
  const current = positiveModulo(index, count);
  const rowCount = Math.ceil(count / FILING_GRID_COLUMNS);
  const row = Math.floor(current / FILING_GRID_COLUMNS);
  const col = current % FILING_GRID_COLUMNS;
  if (direction === "left") {
    return row * FILING_GRID_COLUMNS + positiveModulo(col - 1, FILING_GRID_COLUMNS);
  }
  if (direction === "right") {
    return row * FILING_GRID_COLUMNS + positiveModulo(col + 1, FILING_GRID_COLUMNS);
  }
  if (direction === "up") {
    return positiveModulo(row - 1, rowCount) * FILING_GRID_COLUMNS + col;
  }
  return positiveModulo(row + 1, rowCount) * FILING_GRID_COLUMNS + col;
}

export function applyFilingEdit(
  value: string,
  item: FilingGridItem,
  options: {
    defaults: readonly string[];
    defaultIndex: number;
    maxLength: number;
  }
): FilingEditResult {
  const draft = sanitizeFilingDraft(value, options.maxLength);
  if (item.kind === "ok") {
    const fallback = options.defaults[0] ?? "";
    return {
      value: sanitizeFilingValue(draft, fallback, options.maxLength),
      defaultIndex: options.defaultIndex,
      complete: true
    };
  }
  if (item.kind === "backspace") {
    return { value: draft.slice(0, -1), defaultIndex: options.defaultIndex, complete: false };
  }
  if (item.kind === "space") {
    return {
      value: appendFilingCharacter(draft, " ", options.maxLength),
      defaultIndex: options.defaultIndex,
      complete: false
    };
  }
  if (item.kind === "dontCare") {
    const nextIndex = positiveModulo(options.defaultIndex + 1, Math.max(1, options.defaults.length));
    return {
      value: sanitizeFilingValue(options.defaults[nextIndex] ?? "", options.defaults[0] ?? "", options.maxLength),
      defaultIndex: nextIndex,
      complete: false
    };
  }
  return {
    value: appendFilingCharacter(draft, item.value, options.maxLength),
    defaultIndex: options.defaultIndex,
    complete: false
  };
}

export function sanitizeFilingValue(value: unknown, fallback: string, maxLength = 10): string {
  const source = typeof value === "string" ? value : "";
  const filtered = source
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(0, maxLength));
  if (filtered.length > 0) {
    return filtered;
  }
  return fallback.slice(0, Math.max(0, maxLength));
}

export function validateFilingIntake(value: unknown): FilingIntakeValues | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = sanitizeFilingValue(value.name, FILING_INTAKE_FIELDS[0].defaults[0], FILING_INTAKE_FIELDS[0].maxLength);
  const interest = sanitizeFilingValue(value.interest, FILING_INTAKE_FIELDS[1].defaults[0], FILING_INTAKE_FIELDS[1].maxLength);
  const friend = sanitizeFilingValue(value.friend, FILING_INTAKE_FIELDS[2].defaults[0], FILING_INTAKE_FIELDS[2].maxLength);
  return { name, interest, friend };
}

export function getFilingIntakeFromRegistry(registry: { get(key: string): unknown }): FilingIntakeValues | undefined {
  return validateFilingIntake(registry.get(FILING_INTAKE_REGISTRY_KEY));
}

function appendFilingCharacter(value: string, character: string, maxLength: number): string {
  if (value.length >= maxLength) {
    return value;
  }
  if (character === " " && (value.length === 0 || value.endsWith(" "))) {
    return value;
  }
  return sanitizeFilingDraft(`${value}${character}`, maxLength);
}

function sanitizeFilingDraft(value: unknown, maxLength: number): string {
  const source = typeof value === "string" ? value : "";
  return source
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^ /, "")
    .slice(0, Math.max(0, maxLength));
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
