import type { CharacterCollection, DialoguePage, DialogueSegment, ItemCollection, PsiCollection } from "@eb/schemas";

export const INSTANT_TEXT_SPEED_CPS = Number.POSITIVE_INFINITY;
export const DEFAULT_DIALOGUE_FONT_ID = 0;

export type DialogueTextRun = {
  text: string;
  fontId: number;
};

export interface DialogueResolver {
  playerName(): string;
  partyCharName(i: number): string;
  itemName(i: number): string;
  psiName(i: number): string;
  teleportName(i: number): string;
  statName(i: number): string;
  formatNumber(n: number): string;
  formatMoney(n: number): string;
}

function indexedPlaceholder(label: string, index: number): string {
  return Number.isFinite(index) ? `[${label} ${Math.trunc(index)}]` : `[${label}]`;
}

function formattedNumber(label: string, value: number): string {
  return Number.isFinite(value) ? `${value}` : `[${label}]`;
}

export const DefaultResolver: DialogueResolver = {
  playerName: () => "PLAYER",
  partyCharName: (i) => indexedPlaceholder("char", i),
  itemName: (i) => indexedPlaceholder("item", i),
  psiName: (i) => indexedPlaceholder("psi", i),
  teleportName: (i) => indexedPlaceholder("teleport", i),
  statName: (i) => indexedPlaceholder("stat", i),
  formatNumber: (n) => formattedNumber("number", n),
  formatMoney: (n) => formattedNumber("money", n)
};

export type GeneratedResolverData = {
  characters?: CharacterCollection;
  items?: ItemCollection;
  psi?: PsiCollection;
};

export function createDialogueResolver(data: GeneratedResolverData = {}): DialogueResolver {
  const charactersById = new Map(data.characters?.characters.map((character) => [character.id, character.name.trim()]));
  const itemsById = new Map(data.items?.items.map((item) => [item.id, item.name.trim()]));
  const psiById = new Map(data.psi?.psi.map((psi) => [psi.id, psi.name.trim()]));
  return {
    ...DefaultResolver,
    playerName: () => nonEmpty(charactersById.get(0)) ?? DefaultResolver.playerName(),
    partyCharName: (i) => nonEmpty(charactersById.get(Math.trunc(i))) ?? DefaultResolver.partyCharName(i),
    itemName: (i) => nonEmpty(itemsById.get(Math.trunc(i))) ?? DefaultResolver.itemName(i),
    psiName: (i) => nonEmpty(psiById.get(Math.trunc(i))) ?? DefaultResolver.psiName(i)
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

type SubstitutionSegment = Extract<DialogueSegment, { kind: "substitution" }>;

const RAW_CCS_BRACKET_CONTROL_PATTERN = /\[(?=[^\]]*(?:[0-9a-f]{2}|\{e\())(?:[^\]\r\n]*)\]/giu;

function firstArg(segment: SubstitutionSegment): number {
  return segment.args[0] ?? Number.NaN;
}

function renderSubstitution(segment: SubstitutionSegment, resolver: DialogueResolver): string {
  switch (segment.name) {
    case "playerName":
      return resolver.playerName();
    case "partyChar":
    case "user":
    case "target":
      return resolver.partyCharName(firstArg(segment));
    case "item":
      return resolver.itemName(firstArg(segment));
    case "psi":
      return resolver.psiName(firstArg(segment));
    case "number":
      return resolver.formatNumber(firstArg(segment));
    case "money":
      return resolver.formatMoney(firstArg(segment));
    case "teleport":
      return resolver.teleportName(firstArg(segment));
    case "stat":
      return resolver.statName(firstArg(segment));
  }
  return `[${segment.name}]`;
}

function sanitizeRenderedTextSegment(value: string): string {
  return value
    .replace(RAW_CCS_BRACKET_CONTROL_PATTERN, "")
    .replace(/\]+@+/g, "")
    .replace(/^\]+/, "")
    .replace(/^@+/, "");
}

export function renderSegmentsToText(
  segments: readonly DialogueSegment[] | undefined,
  resolver: DialogueResolver = DefaultResolver
): string {
  let output = "";
  for (const segment of segments ?? []) {
    switch (segment.kind) {
      case "text":
        output += sanitizeRenderedTextSegment(segment.value);
        break;
      case "break":
        output += "\n";
        break;
      case "substitution":
        output += renderSubstitution(segment, resolver);
        break;
      case "pause":
      case "prompt":
      case "style":
      case "window":
      case "control":
        break;
    }
  }
  return output;
}

export function renderSegmentsToTextRuns(
  segments: readonly DialogueSegment[] | undefined,
  resolver: DialogueResolver = DefaultResolver,
  defaultFontId = DEFAULT_DIALOGUE_FONT_ID
): DialogueTextRun[] {
  let activeFontId = defaultFontId;
  const runs: DialogueTextRun[] = [];

  const append = (text: string) => {
    if (text.length === 0) {
      return;
    }
    const previous = runs[runs.length - 1];
    if (previous && previous.fontId === activeFontId) {
      previous.text += text;
    } else {
      runs.push({ text, fontId: activeFontId });
    }
  };

  for (const segment of segments ?? []) {
    switch (segment.kind) {
      case "text":
        append(sanitizeRenderedTextSegment(segment.value));
        break;
      case "break":
        append("\n");
        break;
      case "substitution":
        append(renderSubstitution(segment, resolver));
        break;
      case "style":
        if (segment.style === "font") {
          activeFontId = fontIdFromStyleSegment(segment, defaultFontId);
        }
        break;
      case "pause":
      case "prompt":
      case "window":
      case "control":
        break;
    }
  }
  return runs;
}

export function renderPageToText(
  page: Pick<DialoguePage, "text" | "segments"> | undefined,
  resolver: DialogueResolver = DefaultResolver
): string {
  if (!page) {
    return "";
  }
  if (!page.segments || page.segments.length === 0) {
    return sanitizeRenderedTextSegment(page.text);
  }
  const rendered = renderSegmentsToText(page.segments, resolver);
  return page.segments.every((segment) => segment.kind === "text") ? sanitizeRenderedTextSegment(page.text) : rendered;
}

export function renderPageToTextRuns(
  page: Pick<DialoguePage, "text" | "segments"> | undefined,
  resolver: DialogueResolver = DefaultResolver,
  defaultFontId = DEFAULT_DIALOGUE_FONT_ID
): DialogueTextRun[] {
  if (!page) {
    return [];
  }
  if (!page.segments || page.segments.length === 0 || page.segments.every((segment) => segment.kind === "text")) {
    const text = sanitizeRenderedTextSegment(page.text);
    return text.length > 0 ? [{ text, fontId: defaultFontId }] : [];
  }
  return renderSegmentsToTextRuns(page.segments, resolver, defaultFontId);
}

export function revealTextRuns(runs: readonly DialogueTextRun[], revealedChars: number): DialogueTextRun[] {
  const revealed: DialogueTextRun[] = [];
  let remaining = Math.max(0, Math.trunc(revealedChars));
  for (const run of runs) {
    if (remaining <= 0) {
      break;
    }
    const text = run.text.slice(0, remaining);
    if (text.length > 0) {
      revealed.push({ text, fontId: run.fontId });
    }
    remaining -= run.text.length;
  }
  return revealed;
}

export type RevealState = {
  revealedText: string;
  revealComplete: boolean;
  revealedChars: number;
  totalChars: number;
};

export function revealState(
  fullText: string,
  elapsedMs: number,
  cps: number = INSTANT_TEXT_SPEED_CPS
): RevealState {
  const totalChars = fullText.length;
  if (!Number.isFinite(cps) || cps <= 0) {
    return {
      revealedText: fullText,
      revealComplete: true,
      revealedChars: totalChars,
      totalChars
    };
  }

  const revealedChars = Math.min(totalChars, Math.floor((Math.max(0, elapsedMs) / 1000) * cps));
  return {
    revealedText: fullText.slice(0, revealedChars),
    revealComplete: revealedChars >= totalChars,
    revealedChars,
    totalChars
  };
}

export function perPagePauseMs(segments: readonly DialogueSegment[] | undefined): number {
  return (segments ?? []).reduce((total, segment) => {
    return total + (segment.kind === "pause" ? segment.frames * (1000 / 60) : 0);
  }, 0);
}

export type DialogueConfirmAction = "advance" | "completeReveal";

export function confirmActionForReveal(revealComplete: boolean): DialogueConfirmAction {
  return revealComplete ? "advance" : "completeReveal";
}

export function textSpeedCpsFromSearch(search: string | undefined | null): number {
  const raw = new URLSearchParams(search ?? "").get("textspeed");
  if (!raw || raw.trim().toLowerCase() === "instant") {
    return INSTANT_TEXT_SPEED_CPS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : INSTANT_TEXT_SPEED_CPS;
}

function fontIdFromStyleSegment(
  segment: Extract<DialogueSegment, { kind: "style" }>,
  defaultFontId: number
): number {
  const explicit = segment.args?.[0];
  if (typeof explicit === "number" && Number.isInteger(explicit) && explicit >= 0) {
    return explicit;
  }
  switch (segment.value?.toLowerCase()) {
    case "normal":
      return 0;
    case "saturn":
      return 1;
    default:
      return defaultFontId;
  }
}
