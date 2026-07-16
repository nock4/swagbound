const BATTLE_RESULT_LINE_WIDTH = 28;
const BATTLE_RESULT_PAGE_LINES = 3;

export function namedEnemyResultLine(name: string): string {
  const normalized = name.trim() || "Unknown Enemy";
  const lower = normalized.toLowerCase();
  if (lower.includes("manifestation")) {
    return `${normalized} lost its shape.`;
  }
  if (lower.includes("derivative")) {
    return `${normalized} was delisted.`;
  }
  if (/blood|vampire|vampiric|leech/.test(lower)) {
    return `${normalized} got drained.`;
  }
  if (/underwriter|banker|broker|appraiser|collector|floor/.test(lower)) {
    return `${normalized} was liquidated.`;
  }
  if (/engine|terminal|machine|system|printer/.test(lower)) {
    return `${normalized} went offline.`;
  }
  if (/broadcast|signal|transmitter|antenna/.test(lower)) {
    return `${normalized} lost the signal.`;
  }
  return `${normalized} logged off.`;
}

/** Every result contains the displayed name, with duplicate encounter names shown once. */
export function namedEnemyResultPages(names: readonly string[]): string[][] {
  const lines = [...new Set(names.map(namedEnemyResultLine))].flatMap((line) => wrapResultLine(line));
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += BATTLE_RESULT_PAGE_LINES) {
    pages.push(lines.slice(index, index + BATTLE_RESULT_PAGE_LINES));
  }
  return pages;
}

function wrapResultLine(value: string): string[] {
  if (value.length <= BATTLE_RESULT_LINE_WIDTH) {
    return [value];
  }
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= BATTLE_RESULT_LINE_WIDTH || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}
