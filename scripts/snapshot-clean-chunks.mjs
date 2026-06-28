// Snapshot the CLEAN (un-stamped) chunks that have building overrides, so the
// building-editor can show the bare EB map under the draggable sprites (instead
// of the already-stamped chunk, which would double up). Run AFTER the converter
// build but BEFORE the stamp steps.
import { readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/game/public/generated/assets/world/chunks");
const DST = join(ROOT, "apps/game/public/editor-chunks");
const CONFIG = join(ROOT, "content/building-overrides.json");
if (!existsSync(CONFIG)) process.exit(0);

mkdirSync(DST, { recursive: true });
const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const chunks = [...new Set((cfg.buildings ?? []).map((b) => String(b.chunk).replace(",", "-")))];
let n = 0;
for (const c of chunks) {
  const f = `background-${c}.png`;
  if (existsSync(join(SRC, f))) { copyFileSync(join(SRC, f), join(DST, f)); n++; }
}
console.log(`  snapshot ${n} clean chunk(s) -> editor-chunks/ (for building-editor)`);
