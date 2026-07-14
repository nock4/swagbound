import { chromium } from "@playwright/test";

const baseUrl = (process.argv[2] ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const url = `${baseUrl}/?battle=7&party=4&psi=all&items=1,2,3,4,5,6,7,8,9,10,11,12,13,14`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 1 });
const samples = [];

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForFunction(
    () => globalThis.__battleDebug?.phase === "command-input",
    { timeout: 30_000 }
  );

  const press = async (key) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  };

  const audit = async (label, expectedSubmenu) => {
    const debug = await page.evaluate(() => globalThis.__battleDebug);
    if (!debug) {
      throw new Error(`${label}: __battleDebug is unavailable`);
    }
    if (debug.submenu !== expectedSubmenu) {
      throw new Error(`${label}: expected submenu ${expectedSubmenu}, got ${debug.submenu}`);
    }
    const layout = debug.menuLayout;
    if (!layout) {
      throw new Error(`${label}: menuLayout is unavailable`);
    }
    const rects = Object.entries(layout).flatMap(([name, value]) =>
      name === "statusCards"
        ? value.map((rect, index) => [`statusCards.${index}`, rect])
        : value
          ? [[name, value]]
          : []
    );
    for (const [name, rect] of rects) {
      if (
        rect.x < 0 ||
        rect.y < 0 ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.x + rect.width > 512 ||
        rect.y + rect.height > 448
      ) {
        throw new Error(`${label}: ${name} is outside 512x448: ${JSON.stringify(rect)}`);
      }
    }
    const cardTop = Math.min(...layout.statusCards.map((rect) => rect.y));
    for (const name of ["psiCategory", "submenu", "description"]) {
      const rect = layout[name];
      if (rect && rect.y + rect.height > cardTop) {
        throw new Error(`${label}: ${name} overlaps the party cards`);
      }
    }
    samples.push({
      label,
      submenu: debug.submenu,
      selection: debug.selection,
      psiCategory: debug.psiCategory,
      submenuLabels: debug.visibleMenuLabels?.submenu.length ?? 0
    });
  };

  await audit("command", "command");
  await press("ArrowDown");
  await press("z");
  await audit("psi-category-offense", "psi-category");
  await press("ArrowDown");
  await audit("psi-category-recover", "psi-category");
  await press("ArrowDown");
  await audit("psi-category-assist", "psi-category");
  await press("ArrowUp");
  await press("ArrowUp");
  await press("z");
  await audit("psi-list", "psi");
  for (let index = 0; index < 40; index += 1) {
    await press(index % 2 === 0 ? "ArrowDown" : "ArrowRight");
    await audit(`psi-move-${index}`, "psi");
  }
  await press("x");
  await press("x");
  await press("ArrowUp");
  await press("ArrowRight");
  await press("z");
  await audit("goods-list", "goods");
  for (let index = 0; index < 40; index += 1) {
    await press(index % 2 === 0 ? "ArrowDown" : "ArrowRight");
    await audit(`goods-move-${index}`, "goods");
  }
  await press("x");
  await press("ArrowLeft");
  await press("z");
  await audit("enemy-target", "target");
  for (let index = 0; index < 20; index += 1) {
    await press("ArrowRight");
    await audit(`target-move-${index}`, "target");
  }
  await press("x");
  await audit("return-command", "command");

  console.log(JSON.stringify({ ok: true, url, samples: samples.length }, null, 2));
} finally {
  await browser.close();
}
