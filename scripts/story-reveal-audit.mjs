#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const forbidden = /\b(?:Milady|Malady)\b/i;

const clarity = readJson("content/opening-clarity.json");
const triggers = readJson("content/triggers.json");
const objectives = readJson("content/objectives.json");
const dialogue = readJson("content/custom-dialogue.json");
const world = readJson("apps/game/public/generated/world.json");

const act1TriggerIds = [
  "signal-town-card-clique",
  "signal-town-card-clique-reveal",
  "relay-gate-returnless-king",
  "north-route-gate-warning",
  "first-threshold-malady",
  "first-threshold-malady-reveal",
  "recruit-munch",
  "leave-signal-town"
];

const preAct3ObjectiveIds = [
  "act1-card-clique",
  "act1-returnless-king",
  "act1-malady",
  "act1-munch",
  "act1-leave-signal-town",
  "act2-reach-postwick",
  "act2-postwick-registry",
  "act2-arena-venue-1",
  "act2-arena-venue-2",
  "act2-arena-venue-3",
  "act2-leave-postwick",
  "act2-source-spring",
  "act3-reach-dead-letter",
  "act3-source-undelivered",
  "act3-museum-starman",
  "act3-museum-frank",
  "act3-museum-worm"
];

const failures = [];
const fail = (kind, id, detail) => failures.push({ kind, id, detail });

for (const id of act1TriggerIds) {
  const trigger = triggers.triggers.find((entry) => entry.id === id);
  const pages = clarity.storyTriggerDialogueById[id];
  if (!trigger) {
    fail("missing-trigger", id, "Act 1 trigger does not exist");
    continue;
  }
  if (!pages) {
    fail("missing-trigger-override", id, "Act 1 trigger has no clarity override");
    continue;
  }
  if (forbidden.test(pages.join(" "))) {
    fail("early-name", id, "Act 1 trigger override reveals the antagonist name");
  }
}

for (const id of preAct3ObjectiveIds) {
  const objective = objectives.objectives.find((entry) => entry.id === id);
  if (!objective) {
    continue;
  }
  const text = clarity.objectiveTextById[id] ?? objective.text;
  const hints = objective.npcHints ?? [];
  if (forbidden.test([text, ...hints].join(" "))) {
    fail("early-name", id, "Pre-reveal objective or hint reveals the antagonist name");
  }
}

const arcadeObjective = clarity.objectiveTextById["act1-card-clique"] ?? "";
if (!/\bwest\b/i.test(arcadeObjective) || /\bnorth\b/i.test(arcadeObjective)) {
  fail("route", "act1-card-clique", "Arcade objective must say west and must not say north");
}

const postwickObjective = clarity.objectiveTextById["act2-reach-postwick"] ?? "";
if (/\b(?:north|south|east|west)(?:ern)?\b/i.test(postwickObjective)) {
  fail("route", "act2-reach-postwick", "Unverified Postwick route contains a compass direction");
}

const mornNpcIds = new Set(
  world.npcs
    .filter((npc) => {
      const { x, y } = npc.worldPixel ?? {};
      return x >= 1200 && x <= 2800 && y >= 1000 && y <= 2200;
    })
    .map((npc) => String(npc.npcId))
);

let replacedMorningsideLeaks = 0;
for (const [id, entry] of Object.entries(dialogue.byNpcId ?? {})) {
  if (!mornNpcIds.has(id) || !forbidden.test(JSON.stringify(entry))) {
    continue;
  }
  replacedMorningsideLeaks += 1;
  const replacement = clarity.dialogue.byNpcId[id];
  if (!replacement) {
    fail("missing-npc-override", id, "Morningside NPC still exposes an early antagonist name");
  } else if (forbidden.test(JSON.stringify(replacement))) {
    fail("early-name", id, "Morningside NPC replacement still exposes an early antagonist name");
  }
}

const playerFacingOverlay = {
  cutscenes: Object.values(clarity.cutsceneDialogueById),
  triggers: Object.values(clarity.storyTriggerDialogueById),
  objectives: Object.values(clarity.objectiveTextById),
  enemyNames: Object.values(clarity.battleEnemyNamesById),
  dialogue: clarity.dialogue,
  variants: clarity.dialogueVariantsByNpcId,
  tutorialEnemyName: clarity.tutorialBattle.enemy.name
};
if (forbidden.test(JSON.stringify(playerFacingOverlay))) {
  fail("early-name", "opening-clarity", "Player-facing clarity overlay contains an early antagonist name");
}

const report = {
  status: failures.length === 0 ? "PASS" : "BLOCK",
  act1TriggersCovered: act1TriggerIds.length,
  preAct3ObjectivesChecked: preAct3ObjectiveIds.length,
  morningsideLegacyLeaksReplaced: replacedMorningsideLeaks,
  stateAwareNpcCount: Object.keys(clarity.dialogueVariantsByNpcId ?? {}).length,
  failures
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}
