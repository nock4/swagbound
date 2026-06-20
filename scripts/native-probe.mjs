// Native-viewport probe for the chunked world scene.
// Drives the dev server on :5173 at the real 512x448 viewport (deviceScaleFactor 3),
// can walk the player with arrow-key holds, screenshots, and dumps debug globals.
//
// Usage:
//   node scripts/native-probe.mjs --out shot.png [--url-params "nointro=1&flags=..."]
//        [--walk up:600] [--walk left:300] [--settle 800]
// Multiple --walk steps run in order. Each "dir:ms" holds that arrow key for ms.
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
function all(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name) out.push(args[i + 1]);
  return out;
}

const out = opt("--out", ".codex/screenshots/native-probe.png");
const urlParams = opt("--url-params", "nointro=1");
const settle = Number(opt("--settle", "900"));
const walks = all("--walk");
const base = opt("--base", "http://127.0.0.1:5173/");
const url = `${base}?${urlParams}`;

const KEY = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
// --press z:5 taps the Z key 5 times (advance/confirm dialogue). Runs after all walks.
const presses = all("--press");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 512, height: 448 },
  deviceScaleFactor: 3
});
const consoleLines = [];
page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));

await page.goto(url, { waitUntil: "networkidle" });
// Wait for the scene debug global to appear.
await page.waitForFunction(() => globalThis.__firstSceneDebug !== undefined, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(settle);

async function dump(label) {
  const dbg = await page.evaluate(() => {
    const s = globalThis.__firstSceneDebug ?? null;
    const b = globalThis.__battleDebug ?? null;
    return {
      player: s?.player ?? null,
      facing: s?.facing ?? null,
      sector: s?.currentSectorIndex ?? null,
      dialogueOpen: s?.dialogueOpen ?? null,
      dialogueText: s?.dialogueText ?? null,
      flags: s?.flags ?? null,
      enemies: globalThis.__overworldEnemies ?? null,
      bosses: globalThis.__bossGates ?? null,
      battle: b ? { active: true, enemies: (b.enemies ?? b.party ?? []).length ?? null } : null
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(dbg));
}

await dump("initial");

for (const w of walks) {
  const [dir, msStr] = w.split(":");
  const ms = Number(msStr || "400");
  const key = KEY[dir];
  if (!key) continue;
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(250);
  await dump(`after walk ${dir}:${ms}`);
}

const PKEY = { z: "KeyZ", x: "KeyX", enter: "Enter", space: "Space" };
for (const p of presses) {
  const [name, countStr] = p.split(":");
  const key = PKEY[name] ?? name;
  const count = Number(countStr || "1");
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(350);
  }
  await dump(`after press ${name}x${count}`);
}

await page.screenshot({ path: out });
console.log(`\nscreenshot -> ${out}`);
if (consoleLines.length) {
  console.log("\n--- last console lines ---");
  console.log(consoleLines.slice(-25).join("\n"));
}
await browser.close();
