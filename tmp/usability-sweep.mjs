// Usability matrix runtime sweep.
// Run with a dev server already running:
//   node tmp/usability-sweep.mjs [baseUrl]
//
// Isolation approach:
// - Field rows run first in the chunked-world scene.
// - Each field attempt restores a fresh PartyState snapshot with two party members.
// - Battle rows run after one forced battle starts.
// - Each battle attempt restores a cloned BattleState before queuing exactly one action.
// - The script writes tmp/usability-sweep-report.json with one result per row.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const MATRIX_PATH = "content/usability-matrix.json";
const REPORT_PATH = "tmp/usability-sweep-report.json";
const REFUSAL = "You can't use that here.";
const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: base,
  matrixPath: MATRIX_PATH,
  isolation: {
    field: "fresh PartyState snapshot per row in chunked-world",
    battle: "one forced battle, cloned BattleState restored per row"
  },
  fieldItems: [],
  fieldPsi: [],
  battleItems: [],
  battlePsi: [],
  summary: {}
};

try {
  await page.goto(`${base}?nointro=1&noEncounters=1&psi=all`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(globalThis.__game?.scene?.getScene("chunked-world")), { timeout: 30000 });
  await dismissDialogue(page);
  const field = await page.evaluate(runFieldSweep, { matrix, refusal: REFUSAL });
  report.fieldItems = field.items;
  report.fieldPsi = field.psi;

  await page.evaluate(() => globalThis.__forceEncounter?.(1));
  await page.waitForFunction(() => Boolean(globalThis.__battleDebug), { timeout: 30000 });
  await page.waitForFunction(() => globalThis.__battleDebug?.phase === "command-input", { timeout: 30000 });
  const battle = await page.evaluate(runBattleSweep, { matrix, refusal: REFUSAL });
  report.battleItems = battle.items;
  report.battlePsi = battle.psi;
} finally {
  await browser.close();
}

report.summary = summarize(report);
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary, null, 2));

async function dismissDialogue(targetPage) {
  for (let i = 0; i < 30; i += 1) {
    const open = await targetPage.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
    if (!open) {
      return;
    }
    await targetPage.keyboard.press("KeyZ");
    await targetPage.waitForTimeout(220);
  }
}

function runFieldSweep({ matrix, refusal }) {
  // helpers inlined: evaluate() serializes this function alone
  function restoreFieldParty(partyState, itemId) {
    partyState.restore({
      wallet: 0,
      bank: 0,
      partyIds: [0, 1],
      order: [0, 1],
      inventory: [
        { charId: 0, itemIds: [itemId] },
        { charId: 1, itemIds: [] }
      ],
      equipped: [],
      storage: [],
      statuses: [
        { charId: 0, statuses: [{ ailment: "poisoned" }] },
        { charId: 1, statuses: [{ ailment: "poisoned" }] }
      ],
      vitals: [
        { charId: 0, hp: { current: 20, target: 20 }, maxHp: 120, pp: 300, maxPp: 999 },
        { charId: 1, hp: { current: 0, target: 0 }, maxHp: 100, pp: 80, maxPp: 80 }
      ]
    });
  }
  function restoreBattleState(scene, baseState, row, kind) {
    const state = clone(baseState);
    while (state.party.length < 2) {
      state.party.push(clone(state.party[0]));
    }
    state.party = state.party.slice(0, 2).map((member, index) => ({
      ...member,
      id: `party-${index}`,
      combatantId: `party-${index}`,
      charId: index,
      name: index === 0 ? member.name : "ALLY",
      inventory: kind === "item" && index === 0 ? [row.id] : [],
      hp: {
        ...member.hp,
        displayed: index === 1 ? 0 : 20,
        target: index === 1 ? 0 : 20,
        isRolling: false
      },
      maxHp: Math.max(member.maxHp ?? 100, 120),
      pp: 200,
      maxPp: Math.max(member.maxPp ?? 100, 200),
      statuses: [{ ailment: "poisoned" }]
    }));
    state.enemies = state.enemies.map((enemy, index) => ({
      ...enemy,
      hp: { ...enemy.hp, displayed: 9999, target: 9999, isRolling: false },
      maxHp: Math.max(enemy.maxHp ?? 9999, 9999),
      pp: 200,
      maxPp: 200,
      statuses: []
    }));
    scene["battle_"] = state;
    scene["phase_"] = "execution";
    scene["currentActor_"] = null;
    scene["executionOrder_"] = [{ side: "party", index: 0 }];
    scene["executionStepIndex_"] = 0;
    scene["priorityStep_"] = null;
    scene["queuedCommands_"] = [];
    scene["executionMessageLines_"] = [];
    scene["menuMessage_"] = "";
    scene["pendingFlee_"] = false;
  }
  function queueOneBattleAction(scene, command) {
    scene["queuedCommands_"] = [command];
    scene["inputState_"] = {
      memberCursor: 1,
      submenu: "command",
      selectionIndex: 0,
      queue: [command]
    };
  }
  function fieldSnapshot(partyState, row, targetChar) {
    const vitals = partyState.vitals(targetChar);
    const caster = partyState.vitals(0);
    return {
      inventoryCount: partyState.inventory(0).filter((itemId) => itemId === row.id).length,
      targetHp: vitals?.hp?.target ?? null,
      targetPp: vitals?.pp ?? null,
      casterPp: caster?.pp ?? null,
      statuses: partyState.statuses(targetChar)
    };
  }
  function battleSnapshot(scene, row) {
    const state = scene["battle_"];
    const actor = state.party[0];
    const target = targetForBattleRow(scene, row);
    const targetActor = target?.side === "enemy" ? state.enemies[target.index] : state.party[target?.index ?? 0];
    return {
      inventoryCount: actor.inventory.filter((itemId) => itemId === row.id).length,
      casterPp: actor.pp,
      targetHp: targetActor?.hp?.target ?? null,
      targetPp: targetActor?.pp ?? null,
      statuses: targetActor?.statuses ?? []
    };
  }
  function targetCharForFieldRow(row) {
    return String(row.effectSummary ?? "").startsWith("revive ") ? 1 : 0;
  }
  function targetForBattleRow(scene, row) {
    const battleTarget = (row.targets ?? []).find((target) => target.startsWith("battle:")) ?? "";
    const parts = battleTarget.split(":");
    if (parts[1] === "enemy") {
      return { side: "enemy", index: 0 };
    }
    if (String(row.effectSummary ?? "").startsWith("revive ") && scene["battle_"]?.party?.[1]) {
      return { side: "party", index: 1 };
    }
    return { side: "party", index: 0 };
  }
  function shouldApplyFieldEffect(row) {
    return /^(healHp|recoverPp|revive|cureStatus) /.test(row.effectSummary);
  }
  function fieldEffectChanged(row, before, after) {
    if (row.effectSummary.startsWith("healHp ")) {
      return after.targetHp > before.targetHp;
    }
    if (row.effectSummary.startsWith("recoverPp ")) {
      return after.targetPp > before.targetPp;
    }
    if (row.effectSummary.startsWith("revive ")) {
      return after.targetHp > before.targetHp;
    }
    if (row.effectSummary.startsWith("cureStatus ")) {
      return after.statuses.length < before.statuses.length;
    }
    return true;
  }
  function dialogueText() {
    return String(globalThis.__firstSceneDebug?.dialogueText ?? "");
  }
  function battleText(scene) {
    return [
      scene["menuMessage_"],
      ...(scene["executionMessageLines_"] ?? [])
    ].filter(Boolean).join(" ");
  }
  function resultFor(row, failures, details) {
    return {
      id: row.id,
      name: row.name,
      pass: failures.length === 0,
      failures,
      ...details
    };
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  if (!scene) {
    throw new Error("chunked-world scene not available");
  }
  const partyState = scene["partyState"];
  const data = scene["data_"];
  for (const entry of (data?.psi?.psi ?? [])) {
    entry.learnedBy = [0, 1, 2, 3].map((charId) => ({ charId, level: 1 }));
  }
  const items = [];
  const psi = [];

  for (const row of matrix.items) {
    const itemData = data?.items?.items?.find((entry) => entry.id === row.id);
    restoreFieldParty(partyState, row.id);
    const before = fieldSnapshot(partyState, row, targetCharForFieldRow(row));
    scene["handleItemUseAction"]?.({
      kind: "itemUse",
      ownerChar: 0,
      inventorySlot: 0,
      itemId: row.id,
      targetChar: targetCharForFieldRow(row)
    });
    const text = dialogueText();
    const after = fieldSnapshot(partyState, row, targetCharForFieldRow(row));
    const failures = [];
    if (!itemData) {
      failures.push("item data missing");
    }
    if (row.fieldUse) {
      if (text.includes(refusal)) {
        failures.push("allowed item refused");
      }
      if (!text.trim()) {
        failures.push("allowed item produced no dialogue");
      }
      if (shouldApplyFieldEffect(row) && !fieldEffectChanged(row, before, after)) {
        failures.push("allowed item did not change expected field state");
      }
    } else {
      if (!text.includes(refusal)) {
        failures.push("refused item did not show refusal");
      }
      if (after.inventoryCount !== before.inventoryCount) {
        failures.push("refused item changed inventory count");
      }
    }
    items.push(resultFor(row, failures, {
      expected: row.fieldUse ? "field-use" : "field-refusal",
      text,
      before,
      after
    }));
    scene["dialogue"]?.close?.();
  }

  for (const row of matrix.psi) {
    restoreFieldParty(partyState, 88);
    const before = fieldSnapshot(partyState, row, targetCharForFieldRow(row));
    scene["handlePsiUseAction"]?.({
      kind: "psiUse",
      casterChar: 0,
      psiId: row.id,
      targetChar: targetCharForFieldRow(row)
    });
    const text = dialogueText();
    const after = fieldSnapshot(partyState, row, targetCharForFieldRow(row));
    const failures = [];
    if (row.fieldUse) {
      if (text.includes(refusal)) {
        failures.push("allowed PSI refused");
      }
      if (after.casterPp !== before.casterPp - row.ppCost) {
        failures.push("allowed PSI did not deduct expected PP");
      }
      if (!text.trim()) {
        failures.push("allowed PSI produced no dialogue");
      }
    } else {
      if (!text.includes(refusal)) {
        failures.push("refused PSI did not show refusal");
      }
      if (after.casterPp !== before.casterPp) {
        failures.push("refused PSI changed PP");
      }
    }
    psi.push(resultFor(row, failures, {
      expected: row.fieldUse ? "field-use" : "field-refusal",
      text,
      before,
      after
    }));
    scene["dialogue"]?.close?.();
  }

  return { items, psi };
}

function runBattleSweep({ matrix, refusal }) {
  // helpers inlined: evaluate() serializes this function alone
  function restoreFieldParty(partyState, itemId) {
    partyState.restore({
      wallet: 0,
      bank: 0,
      partyIds: [0, 1],
      order: [0, 1],
      inventory: [
        { charId: 0, itemIds: [itemId] },
        { charId: 1, itemIds: [] }
      ],
      equipped: [],
      storage: [],
      statuses: [
        { charId: 0, statuses: [{ ailment: "poisoned" }] },
        { charId: 1, statuses: [{ ailment: "poisoned" }] }
      ],
      vitals: [
        { charId: 0, hp: { current: 20, target: 20 }, maxHp: 120, pp: 300, maxPp: 999 },
        { charId: 1, hp: { current: 0, target: 0 }, maxHp: 100, pp: 80, maxPp: 80 }
      ]
    });
  }
  function restoreBattleState(scene, baseState, row, kind) {
    const state = clone(baseState);
    while (state.party.length < 2) {
      state.party.push(clone(state.party[0]));
    }
    state.party = state.party.slice(0, 2).map((member, index) => ({
      ...member,
      id: `party-${index}`,
      combatantId: `party-${index}`,
      charId: index,
      name: index === 0 ? member.name : "ALLY",
      inventory: kind === "item" && index === 0 ? [row.id] : [],
      hp: {
        ...member.hp,
        displayed: index === 1 ? 0 : 20,
        target: index === 1 ? 0 : 20,
        isRolling: false
      },
      maxHp: Math.max(member.maxHp ?? 100, 120),
      pp: 200,
      maxPp: Math.max(member.maxPp ?? 100, 200),
      statuses: [{ ailment: "poisoned" }]
    }));
    state.enemies = state.enemies.map((enemy, index) => ({
      ...enemy,
      hp: { ...enemy.hp, displayed: 9999, target: 9999, isRolling: false },
      maxHp: Math.max(enemy.maxHp ?? 9999, 9999),
      pp: 200,
      maxPp: 200,
      statuses: []
    }));
    scene["battle_"] = state;
    scene["phase_"] = "execution";
    scene["currentActor_"] = null;
    scene["executionOrder_"] = [{ side: "party", index: 0 }];
    scene["executionStepIndex_"] = 0;
    scene["priorityStep_"] = null;
    scene["queuedCommands_"] = [];
    scene["executionMessageLines_"] = [];
    scene["menuMessage_"] = "";
    scene["pendingFlee_"] = false;
  }
  function queueOneBattleAction(scene, command) {
    scene["queuedCommands_"] = [command];
    scene["inputState_"] = {
      memberCursor: 1,
      submenu: "command",
      selectionIndex: 0,
      queue: [command]
    };
  }
  function fieldSnapshot(partyState, row, targetChar) {
    const vitals = partyState.vitals(targetChar);
    const caster = partyState.vitals(0);
    return {
      inventoryCount: partyState.inventory(0).filter((itemId) => itemId === row.id).length,
      targetHp: vitals?.hp?.target ?? null,
      targetPp: vitals?.pp ?? null,
      casterPp: caster?.pp ?? null,
      statuses: partyState.statuses(targetChar)
    };
  }
  function battleSnapshot(scene, row) {
    const state = scene["battle_"];
    const actor = state.party[0];
    const target = targetForBattleRow(scene, row);
    const targetActor = target?.side === "enemy" ? state.enemies[target.index] : state.party[target?.index ?? 0];
    return {
      inventoryCount: actor.inventory.filter((itemId) => itemId === row.id).length,
      casterPp: actor.pp,
      targetHp: targetActor?.hp?.target ?? null,
      targetPp: targetActor?.pp ?? null,
      statuses: targetActor?.statuses ?? []
    };
  }
  function targetCharForFieldRow(row) {
    return String(row.effectSummary ?? "").startsWith("revive ") ? 1 : 0;
  }
  function targetForBattleRow(scene, row) {
    const battleTarget = (row.targets ?? []).find((target) => target.startsWith("battle:")) ?? "";
    const parts = battleTarget.split(":");
    if (parts[1] === "enemy") {
      return { side: "enemy", index: 0 };
    }
    if (String(row.effectSummary ?? "").startsWith("revive ") && scene["battle_"]?.party?.[1]) {
      return { side: "party", index: 1 };
    }
    return { side: "party", index: 0 };
  }
  function shouldApplyFieldEffect(row) {
    return /^(healHp|recoverPp|revive|cureStatus) /.test(row.effectSummary);
  }
  function fieldEffectChanged(row, before, after) {
    if (row.effectSummary.startsWith("healHp ")) {
      return after.targetHp > before.targetHp;
    }
    if (row.effectSummary.startsWith("recoverPp ")) {
      return after.targetPp > before.targetPp;
    }
    if (row.effectSummary.startsWith("revive ")) {
      return after.targetHp > before.targetHp;
    }
    if (row.effectSummary.startsWith("cureStatus ")) {
      return after.statuses.length < before.statuses.length;
    }
    return true;
  }
  function dialogueText() {
    return String(globalThis.__firstSceneDebug?.dialogueText ?? "");
  }
  function battleText(scene) {
    return [
      scene["menuMessage_"],
      ...(scene["executionMessageLines_"] ?? [])
    ].filter(Boolean).join(" ");
  }
  function resultFor(row, failures, details) {
    return {
      id: row.id,
      name: row.name,
      pass: failures.length === 0,
      failures,
      ...details
    };
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  const scene = globalThis.__game?.scene?.getScene("battle");
  if (!scene) {
    throw new Error("battle scene not available");
  }
  for (const entry of (scene["psi_"]?.psi ?? [])) {
    entry.learnedBy = [0, 1, 2, 3].map((charId) => ({ charId, level: 1 }));
  }
  const baseState = clone(scene["battle_"]);
  const items = [];
  const psi = [];

  for (const row of matrix.items) {
    restoreBattleState(scene, baseState, row, "item");
    const before = battleSnapshot(scene, row);
    const target = targetForBattleRow(scene, row);
    queueOneBattleAction(scene, { partySlot: 0, command: "GOODS", itemId: row.id, target });
    scene["advanceExecutionStep"]?.();
    const text = battleText(scene);
    const after = battleSnapshot(scene, row);
    const failures = [];
    if (row.battleUse) {
      if (text.includes(refusal)) {
        failures.push("allowed battle item refused");
      }
      if (!text.trim()) {
        failures.push("allowed battle item produced no message");
      }
    } else {
      if (!text.includes(refusal)) {
        failures.push("non-battle item did not show refusal");
      }
      if (after.inventoryCount !== before.inventoryCount) {
        failures.push("non-battle item changed inventory count");
      }
    }
    items.push(resultFor(row, failures, {
      expected: row.battleUse ? "battle-use" : "battle-refusal",
      text,
      before,
      after
    }));
  }

  for (const row of matrix.psi) {
    restoreBattleState(scene, baseState, row, "psi");
    scene["currentActor_"] = { side: "party", index: 0 };
    const listed = scene["learnedPsiForCurrentActor"]?.().some((entry) => entry.id === row.id) ?? false;
    const before = battleSnapshot(scene, row);
    const failures = [];
    let text = "";
    if (row.battleUse) {
      if (!listed) {
        failures.push("battle PSI missing from battle list");
      }
      queueOneBattleAction(scene, {
        partySlot: 0,
        command: "PSI",
        psiId: row.id,
        target: targetForBattleRow(scene, row)
      });
      scene["advanceExecutionStep"]?.();
      text = battleText(scene);
      if (/Cannot use that PSI here/.test(text)) {
        failures.push("allowed battle PSI refused");
      }
      if (battleSnapshot(scene, row).casterPp !== before.casterPp - row.ppCost) {
        failures.push("allowed battle PSI did not deduct expected PP");
      }
    } else {
      if (listed) {
        failures.push("field-only PSI appears in battle list");
      }
    }
    psi.push(resultFor(row, failures, {
      expected: row.battleUse ? "battle-use" : "battle-excluded",
      listed,
      text,
      before,
      after: battleSnapshot(scene, row)
    }));
  }

  return { items, psi };
}

function restoreFieldParty(partyState, itemId) {
  partyState.restore({
    wallet: 0,
    bank: 0,
    partyIds: [0, 1],
    order: [0, 1],
    inventory: [
      { charId: 0, itemIds: [itemId] },
      { charId: 1, itemIds: [] }
    ],
    equipped: [],
    storage: [],
    statuses: [
      { charId: 0, statuses: [{ ailment: "poisoned" }] },
      { charId: 1, statuses: [{ ailment: "poisoned" }] }
    ],
    vitals: [
      { charId: 0, hp: { current: 20, target: 20 }, maxHp: 120, pp: 120, maxPp: 120 },
      { charId: 1, hp: { current: 0, target: 0 }, maxHp: 100, pp: 80, maxPp: 80 }
    ]
  });
}

function restoreBattleState(scene, baseState, row, kind) {
  const state = clone(baseState);
  while (state.party.length < 2) {
    state.party.push(clone(state.party[0]));
  }
  state.party = state.party.slice(0, 2).map((member, index) => ({
    ...member,
    id: `party-${index}`,
    combatantId: `party-${index}`,
    charId: index,
    name: index === 0 ? member.name : "ALLY",
    inventory: kind === "item" && index === 0 ? [row.id] : [],
    hp: {
      ...member.hp,
      displayed: index === 1 ? 0 : 20,
      target: index === 1 ? 0 : 20,
      isRolling: false
    },
    maxHp: Math.max(member.maxHp ?? 100, 120),
    pp: 200,
    maxPp: Math.max(member.maxPp ?? 100, 200),
    statuses: [{ ailment: "poisoned" }]
  }));
  state.enemies = state.enemies.map((enemy, index) => ({
    ...enemy,
    hp: { ...enemy.hp, displayed: 9999, target: 9999, isRolling: false },
    maxHp: Math.max(enemy.maxHp ?? 9999, 9999),
    pp: 200,
    maxPp: 200,
    statuses: []
  }));
  scene["battle_"] = state;
  scene["phase_"] = "execution";
  scene["currentActor_"] = null;
  scene["executionOrder_"] = [{ side: "party", index: 0 }];
  scene["executionStepIndex_"] = 0;
  scene["priorityStep_"] = null;
  scene["queuedCommands_"] = [];
  scene["executionMessageLines_"] = [];
  scene["menuMessage_"] = "";
  scene["pendingFlee_"] = false;
}

function queueOneBattleAction(scene, command) {
  scene["queuedCommands_"] = [command];
  scene["inputState_"] = {
    memberCursor: 1,
    submenu: "command",
    selectionIndex: 0,
    queue: [command]
  };
}

function fieldSnapshot(partyState, row, targetChar) {
  const vitals = partyState.vitals(targetChar);
  const caster = partyState.vitals(0);
  return {
    inventoryCount: partyState.inventory(0).filter((itemId) => itemId === row.id).length,
    targetHp: vitals?.hp?.target ?? null,
    targetPp: vitals?.pp ?? null,
    casterPp: caster?.pp ?? null,
    statuses: partyState.statuses(targetChar)
  };
}

function battleSnapshot(scene, row) {
  const state = scene["battle_"];
  const actor = state.party[0];
  const target = targetForBattleRow(scene, row);
  const targetActor = target?.side === "enemy" ? state.enemies[target.index] : state.party[target?.index ?? 0];
  return {
    inventoryCount: actor.inventory.filter((itemId) => itemId === row.id).length,
    casterPp: actor.pp,
    targetHp: targetActor?.hp?.target ?? null,
    targetPp: targetActor?.pp ?? null,
    statuses: targetActor?.statuses ?? []
  };
}

function targetCharForFieldRow(row) {
  return String(row.effectSummary ?? "").startsWith("revive ") ? 1 : 0;
}

function targetForBattleRow(scene, row) {
  const battleTarget = (row.targets ?? []).find((target) => target.startsWith("battle:")) ?? "";
  const parts = battleTarget.split(":");
  if (parts[1] === "enemy") {
    return { side: "enemy", index: 0 };
  }
  if (String(row.effectSummary ?? "").startsWith("revive ") && scene["battle_"]?.party?.[1]) {
    return { side: "party", index: 1 };
  }
  return { side: "party", index: 0 };
}

function shouldApplyFieldEffect(row) {
  return /^(healHp|recoverPp|revive|cureStatus) /.test(row.effectSummary);
}

function fieldEffectChanged(row, before, after) {
  if (row.effectSummary.startsWith("healHp ")) {
    return after.targetHp > before.targetHp;
  }
  if (row.effectSummary.startsWith("recoverPp ")) {
    return after.targetPp > before.targetPp;
  }
  if (row.effectSummary.startsWith("revive ")) {
    return after.targetHp > before.targetHp;
  }
  if (row.effectSummary.startsWith("cureStatus ")) {
    return after.statuses.length < before.statuses.length;
  }
  return true;
}

function dialogueText() {
  return String(globalThis.__firstSceneDebug?.dialogueText ?? "");
}

function battleText(scene) {
  return [
    scene["menuMessage_"],
    ...(scene["executionMessageLines_"] ?? [])
  ].filter(Boolean).join(" ");
}

function resultFor(row, failures, details) {
  return {
    id: row.id,
    name: row.name,
    pass: failures.length === 0,
    failures,
    ...details
  };
}

function summarize(result) {
  const groups = ["fieldItems", "fieldPsi", "battleItems", "battlePsi"];
  const summary = {};
  for (const group of groups) {
    const rows = result[group];
    summary[group] = {
      total: rows.length,
      passed: rows.filter((row) => row.pass).length,
      failed: rows.filter((row) => !row.pass).length
    };
  }
  summary.failed = groups.reduce((count, group) => count + summary[group].failed, 0);
  return summary;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
