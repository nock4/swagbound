#!/usr/bin/env node
/**
 * Fast focused verifier for the Act-1 climax: a Bosch+Paula duo (?party=2, ?psi=23 grants Bosch
 * Lifeup for the L1 debug) vs the Titanic Ant (group 450). Paula PSI-Freezes the Ant (bypasses its
 * high defense), Bosch Lifeups himself when low. Proves the strategy in ~30s without the full
 * scripts/act1.mjs playthrough. Run: node scripts/duo-malady.mjs   (needs a dev server)
 */
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:5174/";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const peek = () => page.evaluate(() => globalThis.__battleDebug ?? null);
const tap = async (k, ms = 240) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
const sel = async () => (await peek())?.selection ?? "";

// Open the PSI list and land on psi:<id>, then confirm into the target submenu.
async function openPsi(id) {
  await tap("ArrowDown");          // BASH -> PSI (PSI sits directly below BASH)
  await tap("z");                  // open PSI list
  for (let k = 0; k < 10 && !(await sel()).includes(`psi:${id}`); k++) await tap("ArrowDown");
  await tap("z");                  // select PSI -> target submenu
}
// In a target submenu, move the cursor to enemy/party index `want`.
async function pickTarget(want) {
  for (let k = 0; k < 6; k++) {
    const m = (await sel()).match(/:(\d+)$/);
    if (!m || +m[1] === want) return;
    await tap(+m[1] < want ? "ArrowRight" : "ArrowLeft");
  }
}

await page.goto(`${BASE}?battle=450&party=2&psi=23&advantage=enemy`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.__battleDebug, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2200);

let result = "timeout";
for (let step = 0; step < 320; step++) {
  const bd = await peek();
  if (!bd) { await page.waitForTimeout(150); continue; }
  if (bd.phase === "victory-summary") { result = "victory"; break; }
  if (bd.phase === "defeat" || (bd.party ?? []).every((p) => !p.alive)) { result = "defeat"; break; }
  if (bd.phase === "command-input") {
    const idx = bd.inputMemberIndex ?? 0;
    const me = bd.party[idx];
    const ant = bd.enemies[0];           // enemy 0 = Titanic Ant (235 HP, high def)
    const lowest = bd.party.filter((p) => p.alive).reduce((a, p) => (p.hpTarget < a.hpTarget ? p : a));
    let act;
    if (idx === 0) {
      // Bosch: heal if anyone is hurting and he has PP for Lifeup; else BASH the Ant.
      if (lowest.hpTarget <= 35 && me.pp >= 5) { act = "Lifeup"; await openPsi(23); await tap("z"); }
      else { act = "BASH"; await tap("z"); await pickTarget(0); await tap("z"); }
    } else {
      // Paula: Freeze the Ant (bypasses defense) while she has PP; else BASH.
      if (me.pp >= 5) { act = "Freeze"; await openPsi(9); await pickTarget(0); await tap("z"); }
      else { act = "BASH"; await tap("z"); await pickTarget(0); await tap("z"); }
    }
    console.log(`r${bd.roundNumber} m${idx}(${idx ? "Paula" : "Bosch"} ${me.hpTarget}hp/${me.pp}pp) ant=${ant.hpTarget} -> ${act}`);
  } else if (bd.phase === "execution") { await tap("z"); }
  else { await page.waitForTimeout(200); }
}
const f = await peek();
console.log(`\n=== ${result.toUpperCase()} === party=[${(f?.party ?? []).map((p) => `${p.hpTarget}${p.alive ? "" : "x"}`)}] enemy=[${(f?.enemies ?? []).map((e) => `${e.hpTarget}${e.alive ? "" : "x"}`)}]`);
await page.screenshot({ path: ".codex/screenshots/duo-malady.png" });
await b.close();
