# Swagbound - Engineering & QA Handoff

A complete, self-contained brief for an incoming reviewer / QA agent. Read it top to
bottom: sections 1-10 are documentation of the codebase and how to work in it,
section 11 is your assignment and deliverable spec. Everything here is current as of
2026-07-13. If a claim here conflicts with what you observe in the repo, trust the
repo and flag the drift.

---

## 1. What Swagbound is

**Swagbound is a complete, shipped EarthBound total-conversion game**, live at
https://swagbound.pages.dev. It is an original Phaser engine that reimplements
EarthBound's systems and reskins the world into an original story:

> Bosch, a kid with a hood and a Dox Sheet, versus Milady, an omnipresent evil that
> runs on four fuels (anonymity, network-state spirituality, psy-ops, financial
> nihilism). The counters are friendship, honesty, and your true self. Four acts
> across a renamed EarthBound world; an art gallery of original sprites; a licensed
> 27-track mixtape. The full arc plays start to finish, title screen to
> `game:complete`.

**Origin trap:** this repo began as a CoilSnake-romhacking-tutorial experiment. Some
dated docs under `docs/` still read that way. They are **historical**. If a document
sounds like "we are following the EarthBound romhack tutorial," ignore it as current
guidance. The authoritative current docs are `README.md`, `CLAUDE.md`,
`docs/PROJECT-CHARTER.md`, `SETUP.md`, and this file. Do not let a stale doc convince
you this is a tutorial project - a prior reviewer made exactly that mistake.

## 2. Tech stack & repo topology

- **Engine:** Phaser 4 (`^4.1.0`) running in **CANVAS mode, not WebGL** (this has
  real consequences - see trap 6 in section 8). TypeScript `^5.5`, Vite `^5.3`.
- **Validation:** zod `^3.23` schemas in `packages/eb-schemas`.
- **Tests:** Vitest (unit/integration), Playwright (`review-chromium` project) for
  in-browser.
- **Runtime:** Node `25.x`, pnpm `10.x` workspace monorepo.
- **Scale:** ~170 TS files / ~50k LOC of engine in `apps/game/src`; 55 authored
  `content/*.json`; ~57 generated runtime JSON + 640 world chunk files.

Monorepo layout:

| Path | What it is |
|---|---|
| `apps/game/` | The Phaser game: engine (`src/`) + runtime data (`public/generated/`) |
| `packages/eb-converter/` (`@eb/converter`) | CoilSnake decompile -> runtime JSON/PNG |
| `packages/eb-schemas/` (`@eb/schemas`) | Shared zod schemas for all generated + content data |
| `packages/content-builder/` (`@eb/content-builder`) | Content-layer build tooling |
| `content/` | Authored game content (overrides + extensions; see section 4) |
| `scripts/` | Build, balance-runner, QA fleets, atlas/collision/navmesh tooling (66 files) |
| `vendor/` | Swagbound source masters (dialogue corpus, art) |
| `docs/` | Design docs + dated historical reports (`design/`, `qa/`, `audit/`, `pacing/`, ...) |
| `external/coilsnake-*` | The local ROM decompile - **gitignored, never commit** |

## 3. Architecture - the mental model

### 3.1 The three-layer data pipeline (understand this first)

```
EarthBound ROM  ->  CoilSnake decompile  ->  @eb/converter  ->  apps/game/public/generated/*.json + chunks
  (gitignored)        (external/, gitignored)    (build step)         ^ THIS is what the game reads at runtime
                                                                      |
                              content/*.json  (authored overrides) ---+  merged in during the build
```

The game loads only `apps/game/public/generated/`. `content/*.json` is an authoring
source that is folded in by `pnpm build:eb-fullworld`. **Content is inert until
built** - see section 5. Many generated files are `content/` files copied verbatim;
others (e.g. `world.json`, `battle.json`, `npcs.json`) are converter output with
content overrides applied.

### 3.2 Scene graph & runtime

Entry is `apps/game/src/main.ts` (Phaser config, CANVAS renderer, save-key migration,
scene registration). Key scenes:

- **Title / continue:** `titleMenuScene.ts` (+ `titleMenuTiming.ts`) - PRESS ANY
  BUTTON -> war-slide -> SWAGBOUND menu with NEW GAME / CONTINUE / EXPORT SAVE /
  IMPORT SAVE. `gameOverScene.ts` on death.
- **Intro / new game:** `introScene.ts`, `newGameOpening.ts`, `filingIntakeScene.ts`
  (the character-intake opening). The opening cutscene holds input; see section 6.
- **Overworld:** `chunkedWorldScene.ts` is the heart of the game (10k LOC): chunk
  streaming, collision, foreground occluders, interior rooms, doors, NPCs, roamers,
  triggers, the interior-bleed void-cover. `worldScene.ts`, `playerController.ts`,
  `roomBounds.ts`, `doorTriggers.ts`, `mapTransition.ts` support it.
- **Battle:** `battleScene.ts` (view) over a pure model in `battleLogic.ts`,
  `battleRound.ts`, `battleEffects.ts`, `statusEffects.ts`, `battleMenuFlow.ts`,
  `battleBackground.ts`, `battleReturn.ts`.
- **UI / menus:** `uiScene.ts`, `menuModel.ts`, `cleanUi.ts`, `windowFrame.ts`,
  `windowLayout.ts`, `dialogueRenderer.ts`, `bitmapFont.ts`.
- **Minigame:** `sourceCheckScene.ts` + `sourceCheckModel.ts` (the Attestation
  trivia-collectible, internally still `sourcecheck-*`).

### 3.3 The core pattern: pure model, scene-side effects

Battles keep a **pure, testable model** (`battleLogic.ts` / `battleRound.ts`)
separate from Phaser scene effects. Scene-only concerns (e.g. a boss's comeback HP
bump) are applied via `adjustCombatantHp` so the model stays pure. When reviewing,
respect this boundary - logic bugs live in the model files and have unit tests;
render/timing bugs live in the scene.

### 3.4 Subsystems

- **World streaming + collision:** the map is EarthBound's, streamed in chunks.
  Collision is a foot-box-eroded walkable grid; `navmesh.json` (1.7 MB, ~2324
  disconnected components) drives NPC clamping and pathing. Foreground occluders
  (roofs, tree canopy) come from EB's unused walk-behind flags baked at build time
  (`fg-overrides.json`, `collision-overrides.json`). Runtime reads the *generated*
  overrides, not `content/`.
- **Interior rooms + void-cover:** EarthBound embeds interior rooms (caves, dungeons,
  room strips) inside the overworld map. A per-sector `coverArt` flag
  (`indoorSectorCovers.ts` + `world.json.sectors.coverArt`) covers embedded interiors
  with black from the overworld and reveals them when the player is physically inside.
  This shipped 2026-07-13; verify it, do not re-report the bleeds it already hides.
- **Doors / warps:** `doorTriggers.ts`. Destinations are **8px warp units** (multiply
  by 8). Transitions fire ~1 cell from the door. Area triggers fire on real entry;
  warp-in is suppressed.
- **Story triggers / flags:** `content/triggers.json` (area + flag preconditions ->
  dialogue / setFlags / battle / warp) is the authored progression spine, run through
  `eventRunner.ts` / `eventHost.ts`. Flags live in world state (`state.ts` /
  `partyState.ts`); `flag-map.json` bridges to EarthBound's 728 event flags.
- **Cutscenes:** `content/cutscenes.json` re-creates dropped/authored scenes via
  `cutsceneRunner.ts`. Cutscene dialogue does NOT set `dialogueOpen` (press Z through
  it).
- **Dialogue:** `content/custom-dialogue.json` (by NPC id / text pointer) overrides EB
  NPC text in `eventRunner.ts`; ~700 voiced NPCs. CoilSnake `<...>` tokens are
  saved-phrase dictionary refs, unwrapped recursively.
- **Sprites / skins:** `content/sprite-overrides.json` reskins player + NPC + enemy
  (`spriteOverrides.ts`). Gotcha: texture keys must include an image-path hash or
  stale textures render nothing. The party: Ness=Bosch (hooded), Paula/Jeff/Poo
  reskinned.
- **Battle content:** enemy tuning in `content/enemy-stat-overrides.json` (by enemy
  id - check which groups share an enemy before tuning). `battleGroup` resolves by the
  group's **id field** (`battle.groups.find(g => g.id === group)`). Special mechanics:
  `PRAY_VULNERABLE_ENEMIES` in `battleLogic.ts` (pray-to-win bosses like Soul
  Consuming Flame) and `congregationScaling.ts` (trigger-keyed offense scaling).
- **PSI / items / usability:** `content/usability-matrix.json` is the when/where model
  for 254 items + 54 PSI (field vs battle, target rules).
- **Save system:** localStorage key `swagbound:save:<slot>` (slot 0), schema-validated
  JSON (`saveState.ts`). Legacy keys are migrated at boot (`main.ts`). Title menu has
  EXPORT SAVE (download blob) and IMPORT SAVE (validate -> byte-identical write). `P`
  = instant save in the overworld.
- **Music:** an original Web Audio layer plays licensed tracks (NOT SPC emulation):
  `audio/music.ts`, `worldMusic.ts`, `battleMusic.ts`, `sector-music.json`,
  `music-manifest.json`. Dev-only Track Lab auditioner (`musicAuditioner.ts`, key L).
- **The four fuel questlines** (optional side content: The Correction, The Floor, The
  Onboarding, The Unsigned) live additively across `triggers.json`, `cutscenes.json`,
  `overworld-interactables.json` with namespaced ids (`fuel-x-*`, `fuel:x:*`).

## 4. Data model

### 4.1 Authored content (`content/*.json`, folded in at build)

High-signal files to know: `triggers.json` (progression spine), `custom-dialogue.json`
(NPC voice), `cutscenes.json`, `usability-matrix.json` (item/PSI when-where),
`enemy-stat-overrides.json`, `enemy-action-effects.json`, `sprite-overrides.json`,
`overworld-enemy-skins.json`, `background-overrides.json`, `item-overrides.json`,
`psi-overrides.json`, `music-manifest.json` + `sector-music.json`, `flag-map.json`,
`objectives.json`, `attestation-battles.json`, `drifella-source-checks.json` (minigame
card corpus), `collision-overrides.json` + `fg-overrides.json` (collision/occluder
escape hatches), `navmesh.json`. Several large `*-promotion-*.json` / `*-manifest.json`
files are sprite-casting staging data, not live gameplay.

### 4.2 Generated runtime (`apps/game/public/generated/`)

~57 JSON (`world.json`, `battle.json`, `npcs.json`, `characters.json`, `items.json`,
`psi.json`, `encounters.json`, `shops.json`, `sprites.json`, `sprite-groups.json`,
`teleport-destinations.json`, `manifest.json`, `validation-report.json`, plus copies
of many content files) and 640 world chunk PNGs under `assets/world/chunks/`. This is
the only data the running game reads.

## 5. Build, run, deploy

```bash
pnpm install
pnpm build:eb-fullworld     # content/ + decompile -> generated/  (REQUIRED after any content edit)
pnpm dev                    # Vite dev server on 127.0.0.1:5173 (predev runs the build)
pnpm test                   # Vitest (pretest runs the build)
```

- **The rule that bites everyone: content is inert until built.** Edit
  `content/*.json`, boot the game, see no change -> you did not rebuild. Nearly every
  "my fix didn't work" is this. If any runtime code path reads a `content/` file
  directly instead of `generated/`, that is itself a finding - with ONE named
  exception: `content/rom-truth/` holds ROM-derived engine constants (timing curves,
  transition specs) statically imported by `transitions.ts`, `mapTransition.ts`, and
  `ebTiming.ts`. Vite bundles those at app build, so they bypass `build:eb-fullworld`
  by design (edits there take effect on a Vite reload, the OPPOSITE failure mode).
- **Full build only.** `build:eb-fullworld` is the complete build; partial builds
  strip building sign stamps.
- **After building, reset chunk noise before committing:**
  `git checkout -- apps/game/public/generated/assets/world/chunks/`, then commit only
  the changed data files.

Deploy (owner-authed, do not do this unless asked):
```bash
cd apps/game && npm run build      # vite build + prune-dist-audio (drops ~2 GB non-shipping source audio)
wrangler pages deploy dist --project-name=swagbound --branch=main --commit-dirty=true
```
Wrangler is authed via the owner's browser SSO. Never handle deploy tokens directly.

## 6. Debug & QA tooling

**Run and verify live - do not verify by reading code alone.** Drive `pnpm dev` with
Playwright/Chromium headless. **Verify at native viewport 512x448** (upscaling hides
font/window/HUD bugs).

Keys: arrows move, `Z` confirm, `X` cancel, `M` menu, `P` instant save. Dev-only:
backtick = Dev Console, L = Track Lab, N = annotate, shift-click = warp.

DEV debug hooks on `globalThis` (world scene):
- `__firstSceneDebug` - world state (flags, player x/y, menu, `dialogueOpen`,
  `inputLocked`). Absent on title/game-over.
- `__battleDebug` - battle state; never cleared on world return, so detect
  world-vs-battle via `overworldHud !== undefined`.
- `__warpTo(x,y)` - hard teleport (no body-clearance check). Prefer this for capture;
  `?spawn=` silently falls back to default spawn under load.
- `__setStoryFlag`, `__recruit(charId)`, `__setPartyLevels(level)`, `__debugHeal`,
  `__forceEncounter(groupId)`, `__bossGates`, `__solidAt(x,y)` (8px point sample - a
  body can still be wedged where a point sample reads open).

**Booting into free-roam is subtle and burns reviewers.** The opening cutscene does
NOT set `dialogueOpen` and holds `inputLocked` until late. Press `Z` ~40 times,
checking `inputLocked`/`dialogueOpen` each time, before movement works. **Always run a
control:** warp to spawn, hold a direction, confirm the player moved (>8px). If the
control shows 0px your input harness is broken and every "player is stuck / boxed"
result is a false negative - fix the harness before trusting anything.

Prebuilt harnesses (all in `scripts/`):
- `node scripts/arc-runner.mjs <baseUrl>` - plays the whole arc, leveling the party
  per act, using PSI/items, logging every cheat to `tmp/arc-telemetry.json`. **Always
  launch alongside** `node scripts/run-health-watchdog.mjs 15` - long runs hang
  without notifying; the watchdog surfaces stalls. The runner is a *weak* player:
  trust its faceroll signals for "too easy," treat its loss signals with care.
- `scripts/reachability-audit.mjs` - flood-fill reachability of shops/areas from the
  new-game spawn (the correct global-reachability test).
- `python3 scripts/door-return-audit.py` - door-return regression gate: a faithful
  static replica of the runtime door mechanics (foot box, probe depth, arrival
  rings). Exits 1 if any player-facing landing has no triggerable exit. Run it after
  any collision or door data change. `--verbose` also lists narrow-exit landings
  (escapable but the straight-line approach wedges - the signature of the 2026-07-13
  trap room near spawn that convinced two independent testers it was a hard-lock).
- `scripts/playtest-driver.mjs`, `scripts/bughunt-max.mjs`,
  `scripts/overnight-bughunt.mjs` - multi-agent QA fleets (read their headers; note
  the noise lessons in section 8 before scaling them up).
- `scripts/sprite-state-matrix.mjs` - hero visual-state matrix across facings.

Test scripts (`package.json`): `pnpm test` (Vitest), `pnpm test:review` (Playwright
in-browser), `pnpm test:eb` / `test:battle` / `test:fullworld`, `pnpm validate` (schema
validation of generated data), `pnpm exec tsc --noEmit` (types), `pnpm verify` (the
full gate). QA methodology templates: `docs/qa/goal-prompts.md`.

## 7. QA methodology (mandatory - from goal-prompts.md)

For every check, state:
- **GOAL** as a player experience ("a new player can leave the first house and reach
  the arcade").
- **ACCEPT** as exact evidence (a screenshot showing X, a specific log line, a flag
  transition) captured from a **real boot with the build stamp visible**.

Prefer **pixels over properties** - `object.visible === true` is not proof it
rendered; a screenshot is. Identify every sprite you see. If you would report the same
issue twice, instead investigate the *class* of why the first fix never reached the
player.

## 8. Known false-positive traps - check each before filing

A prior 8-fleet bughunt produced ~2,131 findings of which ~30 were real. Do not
recreate that noise.

1. **Interior bleeds are mostly warp-only.** You can cheat-warp inside an embedded
   interior and "see a glitch," but a real player is boxed out and never reaches it.
   Reachability-test: land at the site, try to walk all four directions; max
   displacement < 8px in every direction = boxed = invisible in play = not a bug. The
   void-cover system (section 3.4) already hides reachable interior bleed from the
   overworld.
2. **Local mobility != global reachability.** Interior room floors ARE walkable, so a
   sealed interior reads as "mobile ~44px." True reachability is the spawn flood-fill
   (`scripts/reachability-audit.mjs`), not local walk tests.
3. **Vision over-flags intentional art.** Stylized battle backgrounds (photo collages)
   and special zones (Moonside/Magicant-style neon distortion areas - e.g. the Unlisted
   Room) look "garbled" to a vision model but are deliberate. Confirm against art
   direction.
4. **Wall-clock probes starve under parallel pages.** `waitForTimeout`-based movement/
   animation probes under-count when many headless pages run at once, producing phantom
   "stuck/dead" results. Count real animation frames (rAF), or run fewer pages.
5. **Stale-transform gotchas.** Vite can serve a stale `chunkedWorldScene` transform
   (restart Vite + delete its `.vite` cache); a stray `tsc` without `--noEmit` leaves a
   `.js` beside a `.ts` that Vite serves instead of your edit. If an edit seems ignored,
   check the page's loaded resource list.
6. **Phaser CANVAS mode (no WebGL).** `Shape`/`Rectangle` overlays and `setTint` do not
   composite here; code relying on them is a real bug, and you must verify visuals by
   screenshot, not by object properties. Colored overlays are done with pre-colored 1x1
   images scaled up.
7. **navmesh is fragmented** (~2324 components). Component-matching is not a clean
   reachability test; use `nearestComponentAt`, not raw `componentAt`, and prefer the
   flood-fill.

## 9. Current state - shipped, known-good, and open threads

**Recently shipped / verified (do not re-report as broken without fresh evidence):**
- Full 4-act arc plays end to end to `game:complete`.
- Interior-bleed void-cover system (2026-07-13) - the majority of interior bleeds are
  covered from the overworld and revealed on entry.
- Export/import save + legacy save-key migration.
- A 644-cell visual sweep found **zero sprite-cutoff defects** (the "sprites clipped by
  imprecise mapping" concern was specifically checked and came back clean).
- EarthBound-faithful battle engagement (timed BASH/DEFEND, elemental weakness, damage
  numbers, boss enrage), status effects, Attestation minigame, per-town/sector music.

**Known-open / worth probing (candidate focus areas):**
- Battle edge cases historically produced the real bugs: a sim-hang and a softlock in
  specific groups, save->continue failures, dialogue-stuck-open after save-reload,
  and post-cutscene input-lock leaks. Re-verify these classes. (Door-return failures
  are now gated by `scripts/door-return-audit.py`: zero true hard-locks as of
  2026-07-13; ~335 benign narrow-exit alignment cases remain as polish.)
- The 07-05 story-chain harnesses (`tmp/act*-chain.mjs`) drifted against the reworked
  opening and may not reflect current flow.
- Balance across acts is tuned against a weak autorunner; human-perceived difficulty is
  under-validated.
- Some flagged interior sites remain either boxed (warp-only) or are legit special
  zones; confirm classification before acting.

## 10. Guardrails & constraints (do not violate)

- **No em dashes in any player-facing text.** The gate is zero. (This doc and your
  report should avoid them too - it is a house style.)
- **Never commit the ROM or the CoilSnake decompile** (`EarthBound (USA).sfc`,
  `external/coilsnake-*`). The repo is public; Nintendo copyright.
- **Stage by explicit path - never `git add -A`.** The worktree carries large
  untracked probe/QA artifacts under `tmp/`.
- **Content additions are additive.** Never modify or reorder existing entries in
  `content/*.json`; questline ids/flags are namespaced.
- Default to a **read-only review** unless told to fix. If you fix, verify with a real
  boot and pixels, and rebuild (`pnpm build:eb-fullworld`) for any content change, then
  reset chunk noise.

## 11. Your assignment

Review Swagbound across four lanes, prioritized by player impact. Do static code
review always; do live QA/UX wherever you have a browser. Be explicit about which you
could and could not do.

**A. Functional QA / bug hunting (highest priority).** Hunt softlocks and progression
breakers: battle sim-hangs / unwinnable encounters, door transitions that fail to
return, save->continue failures, dialogue stuck open, input-lock leaks after
cutscenes, boss gates that fail to arm or fail to advance flags. Exercise the full
battle loop (BASH/DEFEND timing, PSI, items, status effects, enemy weakness, boss
enrage), save/load + export/import, shops (Buy/Sell reachable), story triggers and
boss-gate chaining, PSI/item usability against `usability-matrix.json`, recruitment.

**B. UX review.** Menu and dialogue UX at native 512x448 (window borders, font
legibility, cursor behavior, text overflow). Onboarding and intro pacing.
Discoverability (hidden overworld keys M/P/B/T/J/K - are they findable/documented
in-game?). Battle readability. Difficulty pacing across the four acts (remember the
autorunner-is-weak caveat).

**C. Code quality.** Architecture and the model/scene boundary, schema validation
(`packages/eb-schemas`), the converter (`packages/eb-converter`), type safety, dead
code, error handling, and any `content/` vs `generated/` consumption inconsistency.
Flag risky patterns, not style nits.

**D. Data integrity.** Story triggers/flags (`triggers.json`, `flag-map.json`), enemy
tuning (`enemy-stat-overrides.json` - check shared enemy groups), sprite overrides,
door destinations (8px units), music placement.

### Deliverable

A findings report, ranked most-severe first. For each finding:
- **Severity** (blocker / major / minor / polish) and **lane** (functional / UX / code
  / data).
- **Repro steps** a human can follow, or the exact harness command.
- **Evidence** - screenshot path, log line, or flag transition. If you could not verify
  live, say so and mark it **suspected**, kept separate from **confirmed**.
- **The false-positive checks you ran** (reachability, art-direction, harness control)
  so a reviewer can trust it.

Fifteen confirmed, reproducible bugs beat five hundred speculative ones. Be honest
about coverage and limits. Start by reading `README.md`, `CLAUDE.md`, and
`docs/qa/goal-prompts.md`, then boot the game and prove your harness works with a spawn
control before you trust any result.
