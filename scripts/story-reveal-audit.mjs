#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const forbidden = /\b(?:Milady|Malady)\b/i;

const clarity = readJson("content/opening-clarity.json");
const redesign = readJson("content/narrative-redesign.json");
const bossRedesign = readJson("content/boss-battle-dialogue-redesign.json");
const triggers = readJson("content/triggers.json");
const objectives = readJson("content/objectives.json");
const dialogue = readJson("content/custom-dialogue.json");
const world = readJson("apps/game/public/generated/world.json");

const preRevealTriggerIds = [
  "signal-town-card-clique",
  "signal-town-card-clique-reveal",
  "relay-gate-returnless-king",
  "north-route-gate-warning",
  "first-threshold-malady",
  "first-threshold-malady-reveal",
  "recruit-munch",
  "leave-signal-town",
  "postwick-arrival",
  "recruit-cloak",
  "postwick-registry",
  "postwick-registry-reveal",
  "arena-venue-1",
  "arena-venue-2",
  "arena-venue-3",
  "postwick-act2-end",
  "deadletter-arrival",
  "museum-starman",
  "museum-frank",
  "museum-worm"
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
const effective = (section) => ({ ...(clarity[section] ?? {}), ...(redesign[section] ?? {}) });
const effectiveCutscenes = effective("cutsceneDialogueById");
const effectiveTriggerDialogue = effective("storyTriggerDialogueById");
const effectiveObjectives = effective("objectiveTextById");
const effectiveObjectiveHints = effective("objectiveNpcHintsById");
const effectiveEnemyNames = effective("battleEnemyNamesById");
const effectiveDialogue = {
  byNpcId: { ...(clarity.dialogue?.byNpcId ?? {}), ...(redesign.dialogue?.byNpcId ?? {}) },
  byTextPointer: {
    ...(clarity.dialogue?.byTextPointer ?? {}),
    ...(redesign.dialogue?.byTextPointer ?? {})
  }
};
const effectiveVariants = {
  ...(clarity.dialogueVariantsByNpcId ?? {}),
  ...(redesign.dialogueVariantsByNpcId ?? {})
};

for (const id of preRevealTriggerIds) {
  const trigger = triggers.triggers.find((entry) => entry.id === id);
  const pages = effectiveTriggerDialogue[id];
  if (!trigger) {
    fail("missing-trigger", id, "Pre-reveal trigger does not exist");
    continue;
  }
  if (!pages) {
    fail("missing-trigger-override", id, "Pre-reveal trigger has no redesign override");
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
  const text = effectiveObjectives[id] ?? objective.text;
  const hints = effectiveObjectiveHints[id] ?? objective.npcHints ?? [];
  if (forbidden.test([text, ...hints].join(" "))) {
    fail("early-name", id, "Pre-reveal objective or hint reveals the antagonist name");
  }
}

const arcadeObjective = effectiveObjectives["act1-card-clique"] ?? "";
if (!/\bwest\b/i.test(arcadeObjective) || /\bnorth\b/i.test(arcadeObjective)) {
  fail("route", "act1-card-clique", "Arcade objective must say west and must not say north");
}

const postwickObjective = effectiveObjectives["act2-reach-postwick"] ?? "";
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
  const replacement = effectiveDialogue.byNpcId[id];
  if (!replacement) {
    fail("missing-npc-override", id, "Morningside NPC still exposes an early antagonist name");
  } else if (forbidden.test(JSON.stringify(replacement))) {
    fail("early-name", id, "Morningside NPC replacement still exposes an early antagonist name");
  }
}

const playerFacingOverlay = {
  cutscenes: Object.values(effectiveCutscenes),
  triggers: preRevealTriggerIds.flatMap((id) => effectiveTriggerDialogue[id] ?? []),
  objectives: preAct3ObjectiveIds.map((id) => effectiveObjectives[id]).filter(Boolean),
  enemyNames: [effectiveEnemyNames["37"], redesign.tutorialBattle.enemy.name],
  dialogue: effectiveDialogue,
  variants: Object.values(effectiveVariants).flatMap((variants) => variants.filter((variant) =>
    !variant.requireFlags.some((flag) => /^(?:act3:complete|raid:|game:complete)/.test(flag))
  )),
  tutorialEnemyName: redesign.tutorialBattle.enemy.name
};
if (forbidden.test(JSON.stringify(playerFacingOverlay))) {
  fail("early-name", "opening-clarity", "Player-facing clarity overlay contains an early antagonist name");
}

const lateCanon = JSON.stringify({
  reveal: effectiveTriggerDialogue["deadletter-act3-end"],
  occupation: effectiveTriggerDialogue["endgame-return"],
  correction: effectiveTriggerDialogue["raid-morningside-3"],
  final: effectiveTriggerDialogue["milady-final"],
  epilogue: effectiveTriggerDialogue["endgame-finale"],
  objectiveHints: Object.entries(effectiveObjectiveHints)
    .filter(([id]) => /^(?:endgame|raid-|milady-final)/.test(id))
    .map(([, hints]) => hints),
  boss: bossRedesign.byBattleGroup?.["172"]
});
if (/\b(?:she|her|hers|woman|queen|goddess)\b/i.test(lateCanon)) {
  fail("gendered-force", "milady", "Late-game canon genders Milady instead of using it/its");
}

const requiredStoryChecks = [
  ["act2-betrayal", effectiveTriggerDialogue["postwick-act2-end"], /private stuff/i],
  ["act3-private-memory", effectiveTriggerDialogue["museum-frank"], /strawberry/i],
  ["act3-name-reveal", effectiveTriggerDialogue["deadletter-act3-end"], /name it Milady/i],
  ["act4-correction", effectiveTriggerDialogue["raid-morningside-3"], /took the first picture/i],
  ["epilogue-accountability", effectiveTriggerDialogue["endgame-finale"], /without asking Bosch/i]
];
for (const [id, pages, pattern] of requiredStoryChecks) {
  if (!pattern.test((pages ?? []).join(" "))) {
    fail("missing-story-payoff", id, `Required story beat does not match ${pattern}`);
  }
}

const report = {
  status: failures.length === 0 ? "PASS" : "BLOCK",
  preRevealTriggersCovered: preRevealTriggerIds.length,
  preAct3ObjectivesChecked: preAct3ObjectiveIds.length,
  morningsideLegacyLeaksReplaced: replacedMorningsideLeaks,
  stateAwareNpcCount: Object.keys(effectiveVariants).length,
  failures
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}
