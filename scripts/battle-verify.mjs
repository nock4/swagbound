#!/usr/bin/env node
/**
 * In-browser battle-effect regression suite. Drives the REAL game headless (chromium) through a
 * debug battle per case, navigating menus by reading `__battleDebug` (command/submenu/selection),
 * then asserts the outcome from the live battle state (enemy/party hp + statuses + the narration
 * message). This exercises the battle-SCENE event/narration path that the vitest suite doesn't.
 *
 * Prereq: a dev server (`pnpm --filter @eb/game dev`) on the base URL.
 * Run: node scripts/battle-verify.mjs [http://127.0.0.1:5174/]
 *
 * Debug params used: ?battle=<group>&items=<ids>&psi=<ids> (see main.ts). Enemy group 448 starts
 * at 63 HP / 0 PP, so PSI Magnet (needs enemy PP), cure (needs an afflicted ally) and revive (needs
 * a fainted ally) aren't covered here — they'd need a target-state debug hook.
 */
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const SETTLE = 900;
const STEP = 360;

const CASES = [
  { name: "Spark Tube (item 144) damages the enemy", url: "battle=448&items=144", command: "GOODS", needle: ":144",
    ok: (s) => !s.enemies[0].alive || s.enemies[0].hpTarget < 63 },
  { name: "Red Tape (item 142) paralyzes the enemy", url: "battle=448&items=142", command: "GOODS", needle: ":142",
    ok: (s) => s.enemies[0].statuses.includes("paralyzed") },
  { name: "Hypnosis (psi 43) puts the enemy to sleep", url: "battle=448&psi=43", command: "PSI", needle: "psi:43",
    ok: (s) => s.enemies[0].statuses.includes("asleep") },
  { name: "Paralysis (psi 47) paralyzes the enemy", url: "battle=448&psi=47", command: "PSI", needle: "psi:47",
    ok: (s) => s.enemies[0].statuses.includes("paralyzed") },
  { name: "Brainshock (psi 49) confuses the enemy", url: "battle=448&psi=49", command: "PSI", needle: "psi:49",
    ok: (s) => s.enemies[0].statuses.includes("confused") },
  { name: "Shield (psi 31) shields the caster", url: "battle=448&psi=31", command: "PSI", needle: "psi:31",
    ok: (s) => s.party[0].statuses.includes("shielded") },
  { name: "Offense up (psi 39) narrates the buff", url: "battle=448&psi=39", command: "PSI", needle: "psi:39",
    ok: (_s, msgs) => msgs.some((m) => /offense went up/i.test(m)) }
];

const browser = await chromium.launch();
const st = (page) => page.evaluate(() => globalThis.__battleDebug ?? null);
const tap = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(STEP); };

async function runCase(c) {
  const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
  try {
    await page.goto(`${BASE}?${c.url}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => globalThis.__battleDebug, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(SETTLE);
    // Reach the command (GOODS = right of BASH, PSI = below it).
    for (let i = 0; i < 6 && (await st(page)).command !== c.command; i++) {
      await tap(page, c.command === "PSI" ? "ArrowDown" : "ArrowRight");
    }
    await tap(page, "z"); // open submenu
    if (c.command === "GOODS") {
      // The items menu has several entries and the debug `selection` lags the cursor by one, so
      // select by confirming against the target submenu (ground truth), retrying from the top.
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < i; j++) await tap(page, "ArrowDown");
        await tap(page, "z"); // select -> target submenu
        const s = await st(page);
        if (s.submenu === "target" && (s.selection ?? "").includes(c.needle)) break;
        await tap(page, "x"); // cancel back to the items list (cursor resets to the top)
      }
    } else {
      // A single granted PSI is the only learnable entry.
      for (let i = 0; i < 12 && !((await st(page)).selection ?? "").includes(c.needle); i++) {
        await tap(page, "ArrowDown");
      }
      await tap(page, "z"); // select -> target submenu
    }
    await tap(page, "z"); // confirm target
    // Advance execution, collecting narration, until the round ends.
    const msgs = [];
    for (let i = 0; i < 10; i++) {
      const s = await st(page);
      if (s.executionMessage) msgs.push(s.executionMessage);
      if (s.phase === "command-input" || s.phase === "victory-summary") break;
      await tap(page, "z");
    }
    const final = await st(page);
    const pass = Boolean(c.ok(final, msgs));
    return { pass, info: pass ? "" : `enemy=${JSON.stringify(final.enemies[0])} party=${JSON.stringify(final.party[0])} msgs=${JSON.stringify(msgs)}` };
  } catch (e) {
    return { pass: false, info: e.message.split("\n")[0] };
  } finally {
    await page.close();
  }
}

let passed = 0;
for (const c of CASES) {
  const { pass, info } = await runCase(c);
  if (pass) passed += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${c.name}${info ? `\n      ${info}` : ""}`);
}
console.log(`\n${passed}/${CASES.length} passed`);
await browser.close();
process.exit(passed === CASES.length ? 0 : 1);
