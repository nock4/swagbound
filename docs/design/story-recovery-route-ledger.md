# Story Recovery Route Ledger — Act 1 (Morningside)

Browser-verified spatial facts for the Act 1 critical path. Every route below was
planned over the live collision grid (`__solidAt` + `scripts/route.mjs` A*) and
walked/screenshotted in the running game (harness: `tmp/route-ledger-probe.mjs`,
`tmp/house-exit-probe.mjs`; frames in `tmp/route-ledger/`). Directions are honest
compass segments of the actual walkable path; player-facing copy should use the
LANDMARK column, not compass words.

## Resolution of the direction dispute

Three sources disagreed about the first destination:

| Source | Claim | Verdict |
|---|---|---|
| `content/objectives.json` (`act1-card-clique`) | "road **north** of Bosch's block" | **WRONG** — must be rewritten |
| Recovery plan draft + brief | arcade is **south** of the house | **WRONG for the road walk** — the walk from the spawn road point is due west |
| `content/cutscenes.json` ACT-1 PREMISE comment | aims the player **WEST** at the arcade | **CORRECT** (verified: W 615px, zero southing) |

## Beat table

| # | Beat (trigger id) | Coordinate | Verified route from previous beat | Screen-visible landmark (verified frame) | Player action | State change |
|---|---|---|---|---|---|---|
| 0 | New-game spawn (road point; ACT-1 PREMISE cutscene brackets it) | (2112, 1768) | — (house front-door landing: see UNVERIFIED) | **THE PRECINCT** stone building with blue double doors; Spawn-notice sign; roadside present | read notice, take present | premise cutscene fires |
| 1 | `signal-town-card-clique` | (1512, 1744) | **W 615px** along the road | **SLICE** shop (green-striped awning) on the corner; the clique crowds the road in front of **MONS LINK** (big yellow-tiled hall = the arcade); STOP sign; en route: **CAFE**, blue mailbox, town banner | fight the Card Clique | `signal:clique_cleared` |
| 2 | `relay-gate-returnless-king` | (1928, 1560) | E 150px, then **NE 360px** up the main street | the **billboard** and traffic light just north of THE PRECINCT; the **route-aides barrier line** (faithful-servants sprite) blocks the road ahead | fight the Returnless King | `signal:route_open` — **barrier visibly despawns** (already implemented) |
| 3 | `first-threshold-malady` | (1904, 1408) | **N 162px** up the open road | the traffic-light **crossing beside the HOTEL** (SWAG hotel building) | fight the Malady | `signal:threshold_cleared` |
| 4 | `recruit-munch` | area (1888, 1344) | NE 58px (a few steps) | same road, past the hotel | walk on; Munch joins | `recruit:munch` |
| 5 | `leave-signal-town` | area (1888, 1280) | **N 64px** | the road past the **SWAG** hotel sign; exit-stamp clerk | refuse the stamp (dialogue) | `act1:complete` |

## Defects spotted during verification (not blocking, file separately)

- The town banner on the westward road (near the CAFE, ~(1660,1760)) still reads
  **"ONETT TOWN"** — stale EB name on the Act-1 critical path; town is Morningside.
- Two NPCs stand on building rooftops in the relay-gate frame (a frog-suit NPC on
  the red-brick roof ~(1730,1620), a suited figure on THE PRECINCT roof ~(1980,1530)).
  Check whether these are intended roof placements from the placement batch.
- Frames were captured under the night tint; a day-pass re-shoot is optional but
  landmark silhouettes are all legible.

## VERIFIED: the house, and a P0 finding

- **House front-door landing (VERIFIED, real boot).** Wake-in-bed chain walked end
  to end by `tmp/house-exit-probe.mjs`: bedroom (8120,1113) → west door → hall
  (7648,1008) → west staircase → downstairs (7472,336) → east door (7800,336) →
  **front step (2648,352)**. The exterior is the proper EB hilltop house: gray
  siding, striped awning, picket-fence yard, mailbox (frame
  `tmp/route-ledger/15-hilltop-front-step.png`). Authored door flavor already
  fires: "The door is unlocked. It's always unlocked. That's the kind of town".

- **P0 FINDING — the hilltop is sealed off from town.** The navmesh puts the yard
  in component **19** and the whole town spine (premise road point, relay gate) in
  component **176**; they do not connect. Empirical walks south, east, and west all
  dead-end — the dirt road below the yard is pinched shut by the **police car +
  barricade** prop cluster (frame `tmp/route-ledger/16-yard-exit.png`), and the
  only door transitions out of the pocket lead back INTO the house. **A first-time
  player who wakes in bed and walks out the front door can never reach town.**
  Every harness masked this: `act1.mjs` and all sweeps start at the ?nointro spawn
  (2112,1768), which is the road point at the bottom of the hill, not the house.
  Fix candidates (Nick's call, Phase 2): move/remove the car+barricade pinch so the
  road connects (EB-vanilla behavior), or make it a flag-gated barrier that opens
  during the opening beat. The ACT-1 PREMISE cutscene brackets (2112,1768) and
  currently cannot fire for a player walking down from the house.

## UNVERIFIED (do not use in copy yet)

- **Act 1 → Act 2 road.** `leave-signal-town` (y≈1280) sets `act1:complete`;
  Postwick arrival trigger sits at (2256,7376) — far south in world pixels while the
  exit road runs north. The actual connecting route needs its own walked leg before
  any "head down the southern route" copy survives (`objectives.json` currently
  says that, unverified).

## Machine-readable landmarks

`tmp/route-ledger/route-ledger.json` holds the raw legs. When dialogue copy lands,
the approved landmark strings should move into a small JSON (e.g.
`content/route-landmarks.json`) so the story-integrity test can assert copy against
it instead of parsing this document.
