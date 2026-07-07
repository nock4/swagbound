/**
 * Dev-only annotation notes. In dev mode you can drop a pin on the map (or tag the
 * open dialogue line) and type a note; it's appended to tmp/dev-notes.md via the
 * /__dev-notes vite endpoint so Claude can read it back and act on it.
 *
 * Formatting is pure + unit-tested here; the POST is a thin wrapper. Dev-server only.
 */
export type DevNoteContext =
  | {
      kind: "coord";
      x: number;
      y: number;
      tileX: number;
      tileY: number;
      chunkX?: number | null;
      chunkY?: number | null;
      sector: number | null;
      area: number | null;
      town: string | null;
    }
  | {
      kind: "dialogue";
      x: number;
      y: number;
      npcId?: number | string | null;
      textPointer?: string | null;
      dialogue: string;
    };

export type DevNoteEntry = {
  note: string;
  context: DevNoteContext;
};

/** Render one note as a Markdown list block. `iso` is passed in so the output is testable. */
export function formatDevNote(entry: DevNoteEntry, iso: string): string {
  const note = entry.note.trim() || "(no text)";
  const ctx = entry.context;
  if (ctx.kind === "dialogue") {
    const who = ctx.npcId !== undefined && ctx.npcId !== null ? `npc ${ctx.npcId}` : "npc ?";
    const ptr = ctx.textPointer ? ` · ${ctx.textPointer}` : "";
    const line = ctx.dialogue.trim().replace(/\s+/g, " ");
    return [
      `- **[dialogue]** ${who}${ptr} @ (${Math.round(ctx.x)},${Math.round(ctx.y)}) — ${iso}`,
      `  - line: "${line}"`,
      `  - note: ${note}`,
      ""
    ].join("\n");
  }
  const parts = [
    `(${Math.round(ctx.x)},${Math.round(ctx.y)})`,
    `tile ${ctx.tileX},${ctx.tileY}`,
    `chunk ${ctx.chunkX ?? "?"},${ctx.chunkY ?? "?"}`,
    `sector ${ctx.sector ?? "?"}`,
    `area ${ctx.area ?? "?"}`,
    ctx.town ?? "?"
  ];
  return [
    `- **[coord]** ${parts.join(" · ")} — ${iso}`,
    `  - note: ${note}`,
    ""
  ].join("\n");
}

/** A short one-line label for the note, for the console's session list. */
export function summarizeDevNote(entry: DevNoteEntry): string {
  const ctx = entry.context;
  const where = ctx.kind === "dialogue"
    ? `dialogue @ ${Math.round(ctx.x)},${Math.round(ctx.y)}`
    : `${Math.round(ctx.x)},${Math.round(ctx.y)}`;
  const text = entry.note.trim();
  return `${where}: ${text.length > 40 ? `${text.slice(0, 40)}…` : text || "(empty)"}`;
}

/** POST a note to the dev endpoint. Resolves true on success, false otherwise (never throws). */
export async function postDevNote(entry: DevNoteEntry, now: Date = new Date()): Promise<boolean> {
  if (typeof fetch !== "function") {
    return false;
  }
  const markdown = formatDevNote(entry, now.toISOString());
  try {
    const res = await fetch("/__dev-notes", {
      method: "POST",
      headers: { "Content-Type": "text/markdown" },
      body: markdown
    });
    return res.ok;
  } catch {
    return false;
  }
}
