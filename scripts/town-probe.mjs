// Custom town-walk probe: spawn at a tile, hide the dev Track Lab panel, dump
// position + sector, screenshot at native 512x448. Logs chunk image fetches.
//   node scripts/town-probe.mjs --base http://127.0.0.1:5173/ --spawn 1681,6499 --out shot.png [--settle 1400]
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const base = opt("--base", "http://127.0.0.1:5173/");
const spawn = opt("--spawn", "");
const out = opt("--out", "/tmp/livewalk/probe.png");
const settle = Number(opt("--settle", "1600"));
const logChunks = args.includes("--log-chunks");
const params = new URLSearchParams("nointro=1");
if (spawn) params.set("spawn", spawn);
const url = `${base}?${params.toString()}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 3, bypassCSP: true });
await ctx.route("**/*", (route) => route.continue());
const page = await ctx.newPage();
if (logChunks) {
  page.on("response", (r) => { const u = r.url(); if (/background-\d+-\d+\.png/.test(u)) console.error(`CHUNK ${r.status()} ${u.split("/").pop()}`); });
  page.on("console", (m) => { if (m.type() === "error") console.error(`CONSOLEERR ${m.text()}`); });
}
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.__firstSceneDebug !== undefined, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(settle);
await page.evaluate(() => {
  document.querySelector(".swagma-root")?.remove();
  for (const el of document.querySelectorAll("div,p")) {
    if (el.textContent && el.textContent.startsWith("Move: Arrows")) el.style.visibility = "hidden";
  }
});
await page.waitForTimeout(200);
const dbg = await page.evaluate(() => {
  const s = globalThis.__firstSceneDebug ?? null;
  return { player: s?.player, sector: s?.currentSectorIndex };
});
console.log(JSON.stringify(dbg));
await page.screenshot({ path: out });
await browser.close();
