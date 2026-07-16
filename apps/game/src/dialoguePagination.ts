import type { DialoguePage } from "@eb/schemas";
import {
  TALK_WINDOW_DIALOGUE_FONT_SIZE_CSS,
  TALK_WINDOW_VISIBLE_LINES,
  TALK_WINDOW_WRAP_WIDTH_CSS
} from "./ebWindowMetrics";

// Phaser's dialogue font is proportional. Keep a small margin below the panel's
// actual wrap width so browser/font rasterization differences cannot create a
// surprise fourth line at the native 512x448 viewport.
const DIALOGUE_WRAP_SAFETY_PX = 8;
// Calibrated against the shipped EarthBound Dialogue Gold face in Chromium.
// The generic clean-UI heuristic intentionally overestimates this narrow pixel
// font, so scale it to the font's measured advance widths before wrapping.
const DIALOGUE_FONT_WIDTH_SCALE = 0.78;

function estimatedGlyphWidth(char: string, fontSize: number): number {
  if (char === " ") return fontSize * 0.34;
  if ("ilI.,:;!'|".includes(char)) return fontSize * 0.32;
  if ("mwMW@#$%&".includes(char)) return fontSize * 0.86;
  if (char >= "A" && char <= "Z") return fontSize * 0.68;
  if (char >= "0" && char <= "9") return fontSize * 0.58;
  return fontSize * 0.56;
}

export function estimateDialogueTextWidth(text: string): number {
  return Math.ceil(Array.from(text).reduce(
    (sum, char) => sum + estimatedGlyphWidth(char, TALK_WINDOW_DIALOGUE_FONT_SIZE_CSS),
    0
  ) * DIALOGUE_FONT_WIDTH_SCALE);
}

function breakLongWord(word: string, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const char of word) {
    const next = piece + char;
    if (piece && estimateDialogueTextWidth(next) > maxWidth) {
      pieces.push(piece);
      piece = char;
    } else {
      piece = next;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

export function wrapDialogueText(
  text: string,
  maxWidth = TALK_WINDOW_WRAP_WIDTH_CSS - DIALOGUE_WRAP_SAFETY_PX
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    const words = paragraph.trim().split(/\s+/).flatMap((word) => (
      estimateDialogueTextWidth(word) > maxWidth ? breakLongWord(word, maxWidth) : [word]
    ));
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && estimateDialogueTextWidth(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

function isPlainTextPage(page: DialoguePage): boolean {
  return !page.segments || page.segments.length === 0
    || page.segments.every((segment) => segment.kind === "text");
}

export function paginateDialoguePage(page: DialoguePage): DialoguePage[] {
  if (!isPlainTextPage(page)) return [page];
  const lines = wrapDialogueText(page.text);
  if (lines.length === 1) return [page];
  if (lines.length <= TALK_WINDOW_VISIBLE_LINES) {
    const text = lines.join("\n");
    return [{
      ...page,
      text,
      segments: [{ kind: "text", value: text }]
    }];
  }

  const chunks: DialoguePage[] = [];
  for (let index = 0; index < lines.length; index += TALK_WINDOW_VISIBLE_LINES) {
    const text = lines.slice(index, index + TALK_WINDOW_VISIBLE_LINES).join("\n");
    const finalChunk = index + TALK_WINDOW_VISIBLE_LINES >= lines.length;
    chunks.push({
      ...page,
      text,
      ended: finalChunk ? page.ended : false,
      unknownCommands: finalChunk ? page.unknownCommands : [],
      segments: [{ kind: "text", value: text }]
    });
  }
  return chunks;
}

export function paginateDialoguePages(pages: readonly DialoguePage[]): DialoguePage[] {
  return pages.flatMap(paginateDialoguePage);
}
