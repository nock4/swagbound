import { describe, expect, it } from "vitest";
import { formatDevNote, summarizeDevNote } from "./devNotes";

const ISO = "2026-07-05T12:00:00.000Z";

describe("formatDevNote", () => {
  it("formats a coordinate pin with full context", () => {
    const md = formatDevNote(
      {
        note: "this cell should be solid",
        context: { kind: "coord", x: 1954.7, y: 2074.2, tileX: 61, tileY: 64, chunkX: 3, chunkY: 4, sector: 519, area: 12, town: "Morningside" }
      },
      ISO
    );
    expect(md).toContain("**[coord]** (1955,2074) · tile 61,64 · chunk 3,4 · sector 519 · area 12 · Morningside");
    expect(md).toContain(`- ${ISO}`);
    expect(md).toContain("- note: this cell should be solid");
  });

  it("shows ? for missing sector/area/town", () => {
    const md = formatDevNote(
      { note: "x", context: { kind: "coord", x: 0, y: 0, tileX: 0, tileY: 0, sector: null, area: null, town: null } },
      ISO
    );
    expect(md).toContain("chunk ?,? · sector ? · area ? · ?");
  });

  it("formats a dialogue tag with npc + line, collapsing whitespace", () => {
    const md = formatDevNote(
      {
        note: "rewrite, too formal",
        context: { kind: "dialogue", x: 2019, y: 1831, npcId: 100300, dialogue: "The Drifella  looks\n at you." }
      },
      ISO
    );
    expect(md).toContain("**[dialogue]** npc 100300 @ (2019,1831)");
    expect(md).toContain(`- line: "The Drifella looks at you."`);
    expect(md).toContain("- note: rewrite, too formal");
  });

  it("formats a battle note with group, phase, and party HP", () => {
    const md = formatDevNote(
      {
        note: "enemy bark timing feels late",
        context: {
          kind: "battle",
          groupId: 42,
          phase: "execution",
          roundNumber: 3,
          partyHp: [
            { name: "Ness", hp: 28, maxHp: 40, displayedHp: 34, rolling: true },
            { name: "Paula", hp: 18, maxHp: 32 }
          ]
        }
      },
      ISO
    );
    expect(md).toContain(`**[battle]** group 42 · phase execution · round 3 - ${ISO}`);
    expect(md).toContain("party HP: Ness 28/40 shown 34 rolling, Paula 18/32");
    expect(md).toContain("- note: enemy bark timing feels late");
  });

  it("falls back to (no text) for an empty note", () => {
    const md = formatDevNote(
      { note: "   ", context: { kind: "coord", x: 1, y: 2, tileX: 0, tileY: 0, sector: 1, area: 1, town: "T" } },
      ISO
    );
    expect(md).toContain("- note: (no text)");
  });

  it("summarizes a note for the session list", () => {
    expect(
      summarizeDevNote({ note: "solid here", context: { kind: "coord", x: 10, y: 20, tileX: 1, tileY: 2, sector: 1, area: 1, town: "T" } })
    ).toBe("10,20: solid here");
    expect(
      summarizeDevNote({ note: "x", context: { kind: "dialogue", x: 5, y: 6, dialogue: "hi" } })
    ).toBe("dialogue @ 5,6: x");
    expect(
      summarizeDevNote({ note: "x", context: { kind: "battle", groupId: 42, phase: "execution", partyHp: [] } })
    ).toBe("battle group 42: x");
  });
});
