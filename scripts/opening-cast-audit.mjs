#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ALLOWLIST_PATH = "scripts/opening-cast-audit-allowlist.json";
const RAW_SHEET_PREFIX = "generated/assets/sprites/";
const DIRECTION_KEYS = new Set(["up", "right", "down", "left"]);
const enforce = process.argv.slice(2).includes("--enforce");

const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const world = readJson("apps/game/public/generated/world.json");
const sourceChecks = readJson("content/drifella-source-checks.json");
const authorities = [
  {
    file: "content/sprite-overrides.json",
    overrides: readJson("content/sprite-overrides.json")
  },
  {
    file: "content/opening-clarity.json",
    overrides: readJson("content/opening-clarity.json").spriteOverrides ?? {}
  },
  {
    file: "content/narrative-redesign.json",
    overrides: readJson("content/narrative-redesign.json").spriteOverrides ?? {}
  }
];

const allowlist = readAllowlist();
const sourceCheckNpcIds = new Set(sourceChecks.checks.map((check) => String(check.npcId)));
const npcsById = groupBy(world.npcs, (npc) => String(npc.npcId));
const npcsBySpriteGroup = groupBy(world.npcs, (npc) => String(npc.spriteGroup));
const violations = [];

for (const authority of authorities) {
  for (const category of ["byNpcId", "bySpriteGroup"]) {
    for (const [id, override] of Object.entries(authority.overrides[category] ?? {})) {
      if (!override.image?.startsWith(RAW_SHEET_PREFIX)) {
        continue;
      }

      const targets = targetsFor(category, id);
      const personTargets = targets.filter((npc) => typeForNpc(npc) === "person");
      if (personTargets.length === 0) {
        continue;
      }

      addViolation(
        "RAW-SHEET",
        authority.file,
        `${category}.${id}`,
        override.image,
        category === "byNpcId"
          ? `NPC ${id} is type person`
          : `sprite group ${id} includes person NPCs ${listNpcIds(personTargets)}`
      );
    }
  }
}

for (const authority of authorities) {
  for (const [id, override] of Object.entries(authority.overrides.byNpcId ?? {})) {
    const targets = npcsById.get(id) ?? [];
    const propTarget = targets.find((npc) => ["object", "item"].includes(typeForNpc(npc)));
    const animations = override.animations;
    if (!propTarget || !animations || typeof animations !== "object" || Array.isArray(animations)) {
      continue;
    }

    const directionalCount = Object.keys(animations).filter((key) => DIRECTION_KEYS.has(key)).length;
    const hasMultiFrameArray = Object.values(animations).some(
      (frames) => Array.isArray(frames) && frames.length > 1
    );
    if (directionalCount <= 1 && !hasMultiFrameArray) {
      continue;
    }

    const animationReasons = [];
    if (directionalCount > 1) {
      animationReasons.push(`${directionalCount} directional keys`);
    }
    if (hasMultiFrameArray) {
      animationReasons.push("multi-frame arrays");
    }
    addViolation(
      "PROP-ANIMATION",
      authority.file,
      `byNpcId.${id}`,
      override.image ?? "",
      `NPC ${id} is type ${typeForNpc(propTarget)} and has ${joinReasons(animationReasons)}`
    );
  }
}

const spriteAuthority = authorities[0];
for (const category of ["byNpcId", "bySpriteGroup", "overworldByEnemyId"]) {
  for (const [id, override] of Object.entries(spriteAuthority.overrides[category] ?? {})) {
    if (!override.image?.toLowerCase().includes("drifella")) {
      continue;
    }

    if (category === "byNpcId" && sourceCheckNpcIds.has(id)) {
      continue;
    }
    if (category === "bySpriteGroup") {
      const targets = npcsBySpriteGroup.get(id) ?? [];
      if (targets.length > 0 && targets.every((npc) => sourceCheckNpcIds.has(String(npc.npcId)))) {
        continue;
      }
      const leakedTargets = targets.filter((npc) => !sourceCheckNpcIds.has(String(npc.npcId)));
      addViolation(
        "DRIFELLA-SCOPE",
        spriteAuthority.file,
        `${category}.${id}`,
        override.image,
        leakedTargets.length > 0
          ? `sprite group ${id} includes non-Source Check NPCs ${listNpcIds(leakedTargets)}`
          : `sprite group ${id} does not resolve to a Source Check actor`
      );
      continue;
    }

    addViolation(
      "DRIFELLA-SCOPE",
      spriteAuthority.file,
      `${category}.${id}`,
      override.image,
      category === "byNpcId"
        ? `NPC ${id} is not a Source Check actor`
        : `enemy ${id} is not a Source Check overworld actor`
    );
  }
}

printTable(violations);

const countsByRule = Object.fromEntries(
  ["RAW-SHEET", "PROP-ANIMATION", "DRIFELLA-SCOPE"].map((rule) => [
    rule,
    violations.filter((violation) => violation.rule === rule).length
  ])
);
const allowlistedCount = violations.filter((violation) => allowlist.has(violation.allowlistKey)).length;
const newViolations = violations.filter((violation) => !allowlist.has(violation.allowlistKey));

console.log(
  `Summary: ${violations.length} violation(s) `
  + `(RAW-SHEET ${countsByRule["RAW-SHEET"]}, `
  + `PROP-ANIMATION ${countsByRule["PROP-ANIMATION"]}, `
  + `DRIFELLA-SCOPE ${countsByRule["DRIFELLA-SCOPE"]}); `
  + `${allowlistedCount} allowlisted; ${newViolations.length} new.`
);
console.log(enforce
  ? `Enforce: ${newViolations.length === 0 ? "PASS" : "FAIL"}`
  : "Enforce: skipped (pass --enforce to fail on new violations)");

if (enforce && newViolations.length > 0) {
  process.exitCode = 1;
}

function addViolation(rule, file, key, image, why) {
  violations.push({
    rule,
    file,
    key,
    image,
    why,
    allowlistKey: `${file}:${key}`
  });
}

function targetsFor(category, id) {
  return category === "byNpcId"
    ? npcsById.get(id) ?? []
    : npcsBySpriteGroup.get(id) ?? [];
}

function typeForNpc(npc) {
  // The generated world currently labels the opening telephone as a person.
  // Keep this correction narrow until the converter emits its protected prop type.
  if (npc.npcId === 21 && npc.spriteGroup === 215) {
    return "object";
  }
  return npc.type;
}

function groupBy(entries, keyFor) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyFor(entry);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return groups;
}

function listNpcIds(npcs) {
  const ids = npcs.map((npc) => npc.npcId);
  return ids.length <= 8 ? ids.join(", ") : `${ids.slice(0, 8).join(", ")} and ${ids.length - 8} more`;
}

function joinReasons(reasons) {
  return reasons.length === 2 ? `${reasons[0]} and ${reasons[1]}` : reasons[0];
}

function readAllowlist() {
  const absolutePath = resolve(ROOT, ALLOWLIST_PATH);
  if (!existsSync(absolutePath)) {
    return new Set();
  }
  const entries = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) {
    throw new Error(`${ALLOWLIST_PATH} must be an array of strings`);
  }
  return new Set(entries);
}

function printTable(rows) {
  const columns = ["rule", "file", "key", "image", "why"];
  if (rows.length === 0) {
    console.log("No violations.");
    return;
  }

  const widths = Object.fromEntries(columns.map((column) => [
    column,
    Math.max(column.length, ...rows.map((row) => String(row[column]).length))
  ]));
  const line = columns.map((column) => "-".repeat(widths[column])).join("-+-");
  const format = (row) => columns
    .map((column) => String(row[column]).padEnd(widths[column]))
    .join(" | ");

  console.log(format(Object.fromEntries(columns.map((column) => [column, column]))));
  console.log(line);
  for (const row of rows) {
    console.log(format(row));
  }
}
