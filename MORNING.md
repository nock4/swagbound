# Overnight report - 2026-07-10

Branch: overnight/menu-parity-and-fixes (on top of feat/devnotes-batch, PR #174).
Status legend: DONE = pixel-verified, IN FLIGHT = running when this line was written.

## Walk-frame art batch (ow-walkframe-0001) - DONE, awaiting your review
- 604/604 generated, ZERO provider failures, ~1.1 min/item.
- Review worst-first (drift pre-screen sorts likely rejects to the top):
  swagbound-new/asset-lab/overnight/ow-walkframe-0001/review-index/review-ranked.html
  (classic index.html + contact sheet in the same folder; drift-ranking.json has scores)
- Adoption dry-run: ALL 604 plan cleanly (composition + override rewrite validated).
- YOUR MORNING STEP: mark deletes in the review page, then run
  node scripts/adopt-ow-walkframes.mjs --run-dir ../swagbound-new/asset-lab/overnight/ow-walkframe-0001 --approval <your-marks.json>
  Every adopted skin automatically stops using the step toggle and frame-cycles.

## Act-arc regression - DONE, all green
- act1.mjs full autorun on an isolated worktree vite (:5199): act1:complete reached,
  3/3 act-1 bosses beaten solo (card-clique, returnless-king, malady in 15 BASH rounds),
  munch + knight recruit triggers fired en route.
- act2/act3/act4 chain probes: every gate arms/disarms in sequence; act2:complete,
  act3:complete, game:complete all fire. act4's earlier "failure" was harness rot
  (a walk loop that netted zero movement) - probe fixed, game was fine.

## Sprite-cutoff pin sweep - DONE (commit 473a17f)
- All 47 SPRITE CUTOFF pins swept (24 distinct sites), player used as probe sprite.
- 10 real fixes landed as fg-overrides clears, each verified whole-body:
  shrub/canopy edges (1857,414 / 2229,416 / 1593,267), prop-row neighbors
  (2607 + 2673,463), cave bands (3965,5972 / 5400,2528 / 3500,2133), doorway
  column (7439,1017), dorm rug lower-clip (7201,583).
- Code fix: FG clear rects now also suppress the lower-body sprite crop inside
  their bounds (the dorm bug class).
- Stale pins: 7610/7641,1006 + 7432,767 were ALREADY fixed by earlier clears -
  those re-pins predate the fix reaching you. 7432,384 is the interior sector
  mask working per your PR #149 ruling; left alone.

## Goods bug + door-fade gate + encounter tune - DONE (commit c6d4474)
- Goods root cause: the overworld list read partyState.inventory before hydration
  while battle used hydrated members (menuModel.ts:1278). Verified in-engine:
  Goods now lists Proof Card (key-item gold) / Route Roll / Field Water, and
  empty-picker messages REPLACE the picker window instead of overlapping it.
- F06: menu + save key gated on door fades and pending battles (audit fix).
- North-edge encounter: battle group 40 (New Age Retro Hippie, heuristic 215 vs
  act-1 range <= 193) zone-gated out of the Morningside north strip.

## Sprite placements (587 canonical) - DONE (commit c6d4474)
- 442 new added-npc spawns (drafted dialogue in your voice - worth a skim),
  102 Drifella2 source-check friendlies, PFP lanes routed per your zone guidance.
- 26 low-confidence HELD: decision table at tmp/placement-holds-2026-07-10.json.
- MiFella notes honored: Pokey (mifella-001) stands at the Minch door + interior
  npc 52; Pickey (mifella-005) on npc 53. Pixel-verified.
- Verification: 0 omitted duplicates placed (exact-id check - a substring false
  alarm was chased down and disproven), 0 raw-EB renders among new ids, 0 new
  navmesh failures, zone screenshots in tmp/verify/place-*.png (museum hall full
  of Miladys, desert fairy, town kids all rendering canonical skins).

## Menu design parity pass - DONE (commit da86f61)
- Every window surface now renders the authentic EB nine-slice (7 ROM flavors,
  one shared renderer): dialogue, pause + submenus, shop stack, battle
  command/goods/psi/description/message, HP/PP cards, naming, title, game-over.
  Screenshot-verified: dialogue frame, Goods stack, full battle stack.
- HP/PP now read as fixed 3-digit odometer columns (075/025 style).
- EB text blip per letter (square 880-960Hz, 18ms; skips spaces + instant-
  complete). Toggle: eb:textBlip. LISTEN on first boot and tell me if the
  pitch feels right - synth params are one-line tunable.
- Metrics to EB values: dialogue padding 24/18 + 4 visible lines, 23px rows,
  shared triangular caret. Flavor picker in windowSettings (default plain).
- F58: all 45 shop clerks now open Buy/Sell after their custom lines (QA test
  asserts every clerk/store route). Eyeball one shop when you play.

## The night in one line
Walk frames generated (604/604) + review queue prepped; act arc all green;
10 cutoff fixes; 587 sprites placed with Pokey/Pickey canonized; Goods/gates/
encounter fixed; full EB menu parity - all on the overnight branch, PR below.

## Holds for your decisions
- 26 low-confidence placements: tmp/placement-holds-2026-07-10.json
- Walk-frame review marks -> adoption command (top of this file)
- The 3 remaining manual-source skins (npc-sal/morrow/bonkle) + flag-gated
  npc 1152 (grp 41, Postwick)
