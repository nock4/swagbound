# Morning hand-off — autonomous Act-1 autorun

Overnight goal was "push for full Act 1": an unattended harness that discovers the Act-1
objectives and plays through them in a real browser. **It now drives the whole chain and beats
2 of the 3 bosses cleanly; the 3rd (the climax) is a genuine difficulty wall, not a harness bug.**
Every *progression link* in Act 1 is verified end-to-end.

## TL;DR
- `node scripts/act1.mjs` drives a fresh game through the authored Act-1 boss chain:
  **card-clique → returnless-king → malady → leave**, reading the live story flags to pick the
  next objective, A*-routing to each boss, and fighting with an HP-aware AI.
- **card-clique → VICTORY** (sets `signal:clique_cleared`), **returnless-king → VICTORY**
  (sets `signal:route_open`, opens the north barrier). Both legit, no assists.
- **malady → DEFEAT.** It's a **235-HP boss + a 34-HP minion**; solo Bosch at the level you reach
  by beating bosses 1–2 (max HP ~105, ~14 dmg/turn) can't out-DPS it. With the new focus-fire it
  got malady down to **152** before falling — closer, but the math doesn't close without leveling.
- **The final leg is verified**: `node scripts/verify-leg.mjs` injects the boss flags and walks
  into the leave area → **`act1:complete` fires.** So malady's win is the *only* unproven step, and
  it's a balance problem, not a machinery one.
- Quality gates: **803 tests green, tsc clean, `build:eb-fullworld` errors:0.**

## The Act-1 objective graph (from `content/triggers.json`)
| # | boss id | world pos | enemy group | needs flag | sets flag |
|---|---------|-----------|-------------|------------|-----------|
| 1 | signal-town-card-clique | (1512,1744) | 448 | — | `signal:clique_cleared` |
| 2 | relay-gate-returnless-king | (1928,1560) | 36 | `clique_cleared` | `signal:route_open` |
| 3 | first-threshold-malady | (1904,1408) | 450 | `route_open` | `signal:threshold_cleared` |
| ✦ | leave-signal-town (area) | (1888,1280,80×40) | — | `threshold_cleared` | `act1:complete` |

`north-route-barrier` (1880,1496) blocks the north route until `route_open` (i.e. after boss 2),
which the autorun handles automatically by following the flag order.

## What the autorun does (and what was hard)
- **Discovery is flag-driven**, not hard-coded: each loop reads `__firstSceneDebug.flags`, finds the
  boss whose `requireFlags` are met and `setFlags` aren't, routes there, fights, then advances the
  **post-battle dialogue** (that's what actually applies `setFlags` — a settle loop after each win).
- **Router** (`routeTo`): plan A* over the game's own collision (`__solidAt`) → follow → on a stuck
  stretch, nudge free and **re-plan from where it actually is**. The naive "sparse waypoints + walk
  straight between them" version corner-cut into walls and never reached boss 2; the re-planning
  version reaches all three.
- **Combat AI** (`fight`): BASH; DEFEND when low unless the enemy is finishable; **focus-fire** —
  cycles the BASH target to the weakest living enemy so minions die first (decoded the
  `target:BASH:N` selection UI to do this).
- **Healing**: `__debugHeal` (new debug global, see below) full-heals between fights — a stand-in
  for the not-yet-wired hotel/inn. In-battle, PRAY is random so it's not relied on.

## The malady wall — what it'd take (your call)
malady is the Act-1 climax and is tuned like one. To beat it legitimately Bosch needs roughly 2×
the staying power, i.e. several levels. The autorun has a **grind phase** (`grind()` — fight roaming
`__overworldEnemies` until max HP hits a target) but it found **no roaming enemies near the boss**:
spawns are **sector-gated** (`sectorSpawnBudget`/`selectSectorEnemyGroup` return 0/null for the
north-route sectors), and even at the south spawn they appear sparsely. So grinding isn't a
readily-reachable path in the current build. Options, all design decisions for you:
1. **Tune malady down** (HP and/or the minion) so it's a fair fight at the level you arrive with.
2. **Make leveling reachable** — denser/sector-correct overworld encounters near the route, and/or
   wire the **hotel** so healing is real instead of `__debugHeal`.
3. **Give Bosch help** — a party member or stronger starting kit for the climax.

## Debug hook added this run
- **`window.__debugHeal()`** (apps/game/src/chunkedWorldScene.ts, `registerCollisionDebugGlobals`):
  full-heals the party (calls the existing `healParty("full")`). Debug-only; nothing in normal play
  calls it. It's the autorun's between-fights heal until a hotel exists. (You allowed small hooks.)

## Scripts (all in `scripts/`, need a dev server: `pnpm --filter @eb/game dev`)
- `node scripts/act1.mjs [url]` — the full Act-1 autorun (the headline).
- `node scripts/verify-leg.mjs [url]` — verifies malady→leave→`act1:complete` via `?flags=` injection.
- `route.mjs` (A*), `native-probe.mjs`, `battle-verify.mjs`, `play.mjs`, `autoplay.mjs` — the
  browser-driving stack this builds on (already on this branch).
- Debug params: `?nointro=1`, `?spawn=x,y`, `?flags=a,b,c`, `?battle=<group>&items=&psi=&party=`.

## What needs you
1. **Merge PR [#134](https://github.com/nock4/coilsnake-tutorial-experiment/pull/134)** — the battle
   status/effects + browser-driving workstream (still open from the prior run; 803 tests green).
   This Act-1 autorun work is committed on the same branch on top of it.
2. **Decide the malady balance** (the three options above). Once leveling or tuning lands, `act1.mjs`
   should run start-to-`act1:complete` unattended — the rest of the chain already does.

## Screenshots (`.codex/screenshots/`)
- `act1-1-signal-town-card-clique-victory.png`, `act1-2-relay-gate-returnless-king-victory.png` — the two clean wins.
- `act1-3-first-threshold-malady-defeat.png` — the climax wall ("The party fell," Bosch 0/105).
- `act1-leg.png` — the verified leave→`act1:complete` leg.
