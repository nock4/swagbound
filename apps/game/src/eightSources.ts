export const EIGHT_SOURCES_FLAGS = [
  "signal:threshold_cleared",
  "source:intake-ledger:cleared",
  "source:spring:cleared",
  "source:undelivered:cleared",
  "source:vault:cleared",
  "source:pier:cleared",
  "source:vacancy:cleared",
  "source:first-record:cleared"
] as const;

export const ORIGINAL_MIXTAPE_ITEM_ID = 196;
export const ORIGINAL_MIXTAPE_MUSIC_CUE = "mixtape";

export function collectedEightSourcesCount(hasFlag: (flag: string) => boolean): number {
  return EIGHT_SOURCES_FLAGS.filter(hasFlag).length;
}

export function originalMixtapeFieldMessage(collected: number): string {
  return collected <= 0
    ? "The tape is blank. Eight slots wait."
    : `${collected} of ${EIGHT_SOURCES_FLAGS.length} tracks hum on the tape.`;
}
