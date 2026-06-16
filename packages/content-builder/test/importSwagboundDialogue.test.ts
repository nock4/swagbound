import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  GENERATED_FROM,
  buildSwagboundDialogueLibrary,
  importSwagboundDialogue,
  paginateInteriorText
} from "../../../scripts/import-swagbound-dialogue";

describe("importSwagboundDialogue", () => {
  it("normalizes structured dialogue, flattens the start spine, drops choices, paginates text, and substitutes heroName", async () => {
    const root = await mkdtemp(join(tmpdir(), "swagbound-dialogue-"));
    const corpusDir = join(root, "corpus");
    const outputPath = join(root, "library.json");
    await mkdir(corpusDir, { recursive: true });
    try {
      await writeFile(join(corpusDir, "content-dialogue.json"), JSON.stringify({
        schema: "swagbound.dialogue-content.v1",
        dialogues: [{
          id: "intro",
          title: "Intro",
          speaker: "Biscuit",
          startNodeId: "start",
          nodes: [
            {
              id: "start",
              lines: ["Hello, {heroName}."],
              nextNodeId: "spine",
              choices: [{ label: "Branch", nextNodeId: "branch" }]
            },
            {
              id: "branch",
              lines: ["This branch should not be imported."]
            },
            {
              id: "spine",
              lines: ["Stay on the start-node spine."]
            }
          ]
        }]
      }), "utf8");
      await writeFile(join(corpusDir, "interior-interactions.v1.json"), JSON.stringify({
        schema: "swagbound.interior-interactions.v1",
        interactions: {
          "bosch-bedroom-v0": {
            id: "bosch-bedroom-v0",
            speaker: "Biscuit",
            text: "Wake up, {heroName}. The phone is buzzing. This sentence is intentionally long enough that it should force a separate page boundary without splitting words."
          }
        },
        targets: {
          poster: {
            id: "poster",
            speaker: "Narrator",
            text: "A poster waits. {heroName} notices the corner."
          }
        },
        fallback: {
          speaker: "Fallback",
          text: "Do not import this template."
        }
      }), "utf8");

      const summary = await importSwagboundDialogue(corpusDir, outputPath);
      const library = JSON.parse(await readFile(outputPath, "utf8"));

      expect(summary).toMatchObject({
        filesRead: ["content-dialogue.json", "interior-interactions.v1.json"],
        entriesWritten: 3,
        choiceBranchesDropped: 1
      });
      expect(library).toEqual({
        schema: "swagbound.dialogue-library.v1",
        generatedFrom: GENERATED_FROM,
        entries: {
          "dialogue:intro": {
            speaker: "Biscuit",
            pages: ["Hello, Bosch.", "Stay on the start-node spine."]
          },
          "interior:bosch-bedroom-v0": {
            speaker: "Biscuit",
            pages: [
              "Wake up, Bosch. The phone is buzzing.",
              "This sentence is intentionally long enough that it should force a separate page boundary without splitting words."
            ]
          },
          "target:poster": {
            speaker: "Narrator",
            pages: ["A poster waits. Bosch notices the corner."]
          }
        }
      });
      expect(JSON.stringify(library)).not.toContain("/Users/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps pagination on word boundaries when a sentence is too long", () => {
    expect(paginateInteriorText(
      "Alpha beta gamma delta epsilon zeta.",
      18
    )).toEqual([
      "Alpha beta gamma",
      "delta epsilon",
      "zeta."
    ]);
  });

  it("tolerates a missing source file", () => {
    const result = buildSwagboundDialogueLibrary({
      interiorInteractions: {
        interactions: {
          only: {
            speaker: "Biscuit",
            text: "Hi, {heroName}."
          }
        },
        targets: {}
      }
    });

    expect(result.choiceBranchesDropped).toBe(0);
    expect(result.library.entries).toEqual({
      "interior:only": {
        speaker: "Biscuit",
        pages: ["Hi, Bosch."]
      }
    });
  });
});
