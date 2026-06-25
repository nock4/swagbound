# Morning hand-off — autonomous Act-1 autorun (COMPLETE)

Goal was "push for full Act 1": an unattended harness that discovers the Act-1 objectives and plays
through them in a real browser. **`node scripts/act1.mjs` now beats all three bosses and reaches
`act1:complete`, fully unattended.** The climax wall was solved by giving Bosch a party member
(Paula) — your "give Bosch help" call.

## TL;DR
- `node scripts/act1.mjs` drives a fresh game through the authored chain
  **card-clique → returnless-king → malady → leave** → **`act1:complete`**: flag-driven, A*-routing
  to each boss, fighting with a PSI-aware duo AI. All three wins are legit (no debug assists in the
  fights; `__debugHeal` only stands in for the hotel *between* fights).
- **The climax was a balance reality, not a bug:** malady = the **Titanic Ant** (235 HP, **defense
  23**) + a Black Antoid. Physical BASH does ~3/hit against that defense, so solo Bosch couldn't win.
- **The fix (you chose "party member"):** Act 1 is now a **Bosch + Paula duo**. Paula casts **PSI
  Freeze** (bypasses defense, ~29/cast) to melt the Ant; Bosch **Lifeups** himself when the Ant
  focuses him. Both survive; the Ant dies in ~8 casts.
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
- **Combat AI** (`fight`): drives both members via `b.inputMemberIndex`. **Paula** casts PSI Freeze
  on the toughest enemy (bypasses high defense); **Bosch** Lifeups himself when low (safe BASH
  fallback if he hasn't learned it yet), else BASH/focus-fire. Decoded the PSI-cast + `target:BASH:N`
  selection UIs to do this.
- **Healing**: `__debugHeal` full-heals + restores PP *between* fights (hotel stand-in); the
  in-battle sustain is Bosch's real Lifeup, not a debug assist.

## The climax — solved with a party member (your call)
malady = the **Titanic Ant** (235 HP, **defense 23**) + a Black Antoid — literally EarthBound's Giant
Step boss, tuned for a higher-level Ness+Paula. Its high defense makes physical BASH near-useless
(~3/hit), which is why solo Bosch lost (he got it to 152 at best). The fix you chose — **a party
member** — works cleanly: Paula's **PSI Freeze** bypasses defense (~29/cast) and Bosch's **Lifeup**
keeps him alive while the Ant focuses him. The Ant dies in ~8 casts and both survive. Act 1 is now a
**Bosch + Paula duo** (`ensureIntroParty` seeds both).

Still open, but a creative call (not blocking): **Paula's Swagbound identity.** She uses the
canonical name "Paula" + EB sprite for now — give me a Swagbound name and I'll skin her battle sprite
via `content/sprite-overrides.json`. She also joins from the start of Act 1; if you want a proper
join scene, that's a `content/cutscenes.json` + flag-gate follow-up.

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
1. **Review/merge the duo branch** `feat/act1-duo-paula` — Act 1 is now a Bosch+Paula duo that
   completes autonomously (3/3 bosses → `act1:complete`). 803 tests green, tsc clean. (The prior
   battle-effects + browser-driving workstream already merged as #134.)
2. **Paula's identity** — a quick creative call (Swagbound name), then I skin her sprite. See above.

## Screenshots (`.codex/screenshots/`)
- `act1-1-signal-town-card-clique-victory.png`, `act1-2-relay-gate-returnless-king-victory.png` — bosses 1–2.
- `act1-3-first-threshold-malady-victory.png` — the climax win (Bosch 95/122 + Paula 47/47 both standing).
- `act1-leave.png` — the `act1:complete` moment.
- `duo-malady.png` — the focused duo-vs-Titanic-Ant verifier.
