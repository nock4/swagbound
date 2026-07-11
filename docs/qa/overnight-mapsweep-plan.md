# Overnight Map Sweep — Self-Analyzed Visual QA

Nick's ask (2026-07-10): navigate to every part of the whole map, screenshot in
gameplay, and have ME (the orchestrator) analyze each frame the way I do when Nick
sends a screenshot. When something is glitchy, fix it and re-check; do not move on
until it is fixed. Decisions: **overworld + all 118 interiors**, **hybrid
fix-or-park**, **full send** (no calibration slice).

## Proven machinery (smoke-tested 2026-07-10)

- `tmp/mapsweep/capture.mjs` — warps to a tiered target list in a **fully-progressed
  daytime state** (`tmp/mapsweep/sweep-flags.json`, all 32 story setFlags → boss gates
  defused, Act-1 night tint off so glitches are visible), settles until real control
  (no cutscene/dialogue/menu), screenshots at native 512x448 with the build stamp,
  and writes `manifest-<region>.json` (per shot: id, kind, target, landed, warpOk,
  control, night, file). 8-shot anchor smoke test: all control=true, warpOk=true,
  night=off, correct landings.
- Analysis proof: on the 8 anchors I PASSed the arcade block and **caught a real
  roof-walking glitch** (actor on the Postwick house roof) without flagging the
  intentional LSW roamer sprites — calibration held.

## CRITICAL harness lesson (converged on shot 0000, pre-flight — two iterations)

The teleported player is NOISE for a map-integrity sweep and produced two different
false artifacts before the approach converged:
1. `__warpTo` ignores collision → aiming at a solid tile drops the player ON it →
   false "standing on a tree" (the tree tile is correctly solid; a real player is
   blocked). Added `snapToWalkable` (nearest non-solid cell).
2. Snapping to the nearest walkable cell can land the player BEHIND foliage → the tree
   FG-occludes his lower half → false "cut in half."
**Converged fix (shipped): HIDE the player sprite (+ followers) before every
screenshot.** The sweep photographs the map, NPCs, enemies, and objects — the real
subjects. Nothing about the teleported player's own position is ever a real defect, so
removing him removes a whole class of false positives while keeping every real glitch
(floating fragments, mis-skins, NPCs/enemies on roofs, tile seams, stale names,
interior bleed) fully visible.

## Analysis discipline (my first failure, now a gate)

I marked shot 0000 PASS and missed the player standing on a tree because I scanned
sprites/buildings and never checked the player's FOOTING. Every frame must gate on:
(1) is the player's base at ground level, and does any actor/object sit at the wrong
height on solid art (roof/tree/wall); (2) TILE/GROUND continuity, not just sprites
(sidewalk/road/grass seams, misplaced ground fragments); (3) then sprites, names,
placement. Zoom into any region before judging — do not eyeball at 1x.

## Regions & scale

- `anchors` — 15 boss gates + 15 signs (offset +72/+40 so the camera frames the
  spot without contacting a gate). ~30 shots.
- `interiors` — all 118 rooms (tmp/interior-targets.json). ~118 shots.
- `overworld` — walkable grid, STEP=360px over 8192x10240, void-skipped. ~500-600 shots.
- Total ~650-750 real shots (void cells skipped).

## The loop (per region, resumable across wake-ups)

1. **Capture** the region → shots + manifest.
2. **Analyze** in bounded batches (~12-15 shots per pass so they fit context). Each
   shot → PASS or a finding appended to `tmp/mapsweep/ledger.jsonl`
   `{n, id, coord, class, severity, desc, status:"open"}`.
3. **Fix** each finding by class (below). After a fix, **re-warp to that coord,
   re-shoot, re-analyze**; the ledger item closes only when the follow-up frame is
   clean. Hybrid rule: block-and-fix anything data- or codex-fixable; if a finding is
   truly blocked (needs a design call, risky engine change, or Codex keeps failing),
   set `status:"parked"` with a detailed ticket + screenshot and continue so one hard
   bug never stalls the night.
4. **Cursor** (`tmp/mapsweep/cursor.json`) records region + batch index so a wake-up
   resumes exactly where it left off.
5. **Morning**: `MAPSWEEP-MORNING.md` — shots analyzed, findings fixed vs parked,
   before/after thumbnails, parked-ticket list.

## Glitch taxonomy (what counts as a finding)

- **roof-walking / depth**: actor or object rendered on top of a building roof; sprite
  z-order wrong (behind what should occlude it, or vice-versa).
- **floating fragment**: a stray map tile / object island in open terrain or an
  isolated interior (the "map fragments floating" class).
- **interior bleed**: neighbor-room tiles visible past a sector-area boundary that
  should be solid black.
- **mis-skin / missing texture**: an NPC/enemy/object showing the wrong sprite, a
  placeholder box, or nothing.
- **collision-visible**: player standing inside a solid object (house body, wall) —
  walkable band where art is solid.
- **stale name / text**: EB-era names on the map (e.g. the ONETT TOWN banner), wrong
  sign text.
- **placement**: sprite clipping into scenery, half-off a ledge, in water, or on an
  unreachable tile.
- **clipping / seams**: chunk seams, tile-edge tears, obvious palette strobes.

## Intentional — DO NOT flag (calibration allowlist)

- Photo-collage **battle backgrounds** (Nick's art; the codex-vision pass wrongly
  called these "garbled").
- Detailed, high-color **LSW / Super Metal Mons enemy + NPC sprites** — these are
  deliberately not flat-EB (the 601-sprite roster).
- Deliberate surreal placements from the design (e.g. authored odd NPCs).
- Pending art known to be mid-swap (e.g. the detailed intake ledger until the
  EB-style regen lands).
- The dev badge/build stamp and the "Move: Arrows/WASD" hint overlay.

## Fix routing

- **Data-class (I fix directly):** collision-overrides (roof-walking, walkable-band),
  sprite-overrides (mis-skin), sign-names / sign-overrides (stale text), added-npcs /
  placement queues (placement), fg-overrides (occluder), interior sector bounds
  (bleed). Rebuild generated + re-verify.
- **Code-class (Codex delta):** render-depth ordering, engine-level occlusion, chunk
  seam rendering. Launch codex-rescue WITHOUT naming a model (the forwarder's default
  gpt-5.5-codex fails on this account ~half the time; relaunch on failure).

## Run hygiene

- Own vite (:5199 or the running :5174), local branch, **never push** (Nick reviews
  the morning report). caffeinate for the night. Stage fixes by explicit path
  (NEVER `git add -A` — 317 untracked vault assets live in the tree).
- Capture in the daytime progressed state; **night + early-game state passes are
  explicit follow-up runs** (a uniform tint pass and a fresh-new-game pass), noted so
  we do not pretend one state covers all.

## Open for Nick

- What ELSE goes in this overnight run beyond the map sweep? (He said "one thing I
  want you to do is..." — implying more.)
- The still-open backlog that could ride along: walk-frame adoption marks, the
  EB-style object art (in flight), the Archivist, sanctuary sites 3-8, PR #174/#175
  merges, the beat-sheet sign-off.
