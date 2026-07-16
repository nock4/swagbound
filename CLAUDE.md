# CLAUDE.md — Swagbound

This is **Swagbound, a complete EarthBound total-conversion game**, live at
https://swagbound.pages.dev. It is NOT a CoilSnake tutorial (that was this repo's
origin, and some dated docs under `docs/` are from that era — treat anything that
reads that way as historical). Start with [README.md](README.md) for the repo map.

## Load-bearing invariants

- **Content is inert until built.** The game reads `apps/game/public/generated/`,
  not `content/`. After editing `content/*.json`, run `pnpm build:eb-fullworld`
  (the FULL build — partial builds strip building sign stamps), then reset chunk
  noise: `git checkout -- apps/game/public/generated/assets/world/chunks/` and
  commit only the changed generated data files. NAMED EXCEPTION: `content/rom-truth/`
  (ROM-derived engine constants) is imported statically by `transitions.ts`,
  `mapTransition.ts`, and `ebTiming.ts` — Vite bundles it, so edits there take
  effect WITHOUT `build:eb-fullworld`.
- **Never commit the ROM or the CoilSnake decompile** (`EarthBound (USA).sfc`,
  `external/coilsnake-*`). Nintendo copyright; the repo is public.
- **No em dashes in player-facing text.** Grep your additions; the gate is zero.
- **Stage by explicit path.** Never `git add -A` (the worktree carries large
  untracked probe/QA artifacts in `tmp/`).
- **Content additions are additive.** Never modify or reorder existing entries in
  `content/*.json`; fuel-questline ids/flags are namespaced (`fuel-x-*`, `fuel:x:*`).
  NAMED EXCEPTION: `content/early-game-sequence.json` declares exclusive opening
  ownership; the loader suppresses matching contributions from older overlays
  instead of modifying their historical entries.
- **Verify with pixels and real boots, not properties.** Goal-prompt templates in
  `docs/qa/goal-prompts.md`. Native viewport is 512x448.

## Verifying changes live

Playwright + the dev server (`pnpm dev`, or the `.claude/launch.json` `game-dev`
entry). DEV debug hooks on `globalThis`: `__firstSceneDebug` (world state incl.
flags/player/menu; world-scene only, absent on title/game-over), `__battleDebug`
(never cleared on world return; use `overworldHud !== undefined` to detect
world-vs-battle), `__warpTo(x,y)` (hard teleport, no body-clearance check),
`__setStoryFlag`, `__recruit(charId)`, `__setPartyLevels(level)`, `__debugHeal`,
`__forceEncounter(groupId)`, `__bossGates`, `__solidAt(x,y)` (8px point sample; a
player body can still be wedged where point samples read open).

Keys: arrows move, Z confirm, X cancel, M menu, P instant save. Area triggers fire
on real entry (warp-inside is suppressed; walk out and back in). Cutscene dialogue
does NOT set `dialogueOpen` — press Z through it.

## Battle/balance specifics

- Trigger `battleGroup` resolves by the group's **id field** (`battle.groups.find(g
  => g.id === group)`), and gate context rides in `pendingStoryGate.triggerId`.
- Enemy tuning: `content/enemy-stat-overrides.json` (by enemy id — check which
  groups share the enemy before tuning). Special mechanics: `PRAY_VULNERABLE_ENEMIES`
  in `battleLogic.ts` (pray-to-win bosses, e.g. Soul Consuming Flame) and
  `congregationScaling.ts` (trigger-keyed offense scaling).
- The balance autorunner: `node scripts/arc-runner.mjs <baseUrl>` plays the whole
  arc; ALWAYS launch alongside `node scripts/run-health-watchdog.mjs 15`. It levels
  the party per act (`ACT_LEVEL_CURVE`), uses PSI/items, and logs every cheat to
  `tmp/arc-telemetry.json`. Its faceroll signals are trustworthy for buffs; treat
  loss signals with care.

## Deploy

`cd apps/game && npm run build` (vite + `scripts/prune-dist-audio.mjs`, which strips
the 2GB of non-shipping source audio), then
`wrangler pages deploy dist --project-name=swagbound --branch=main --commit-dirty=true`.
Wrangler is authed via the owner's browser SSO; never handle tokens directly.

## Doc hygiene

Dated files in `docs/` (reports, QA logs, `MORNING.md`) are historical records —
do not "fix" them retroactively. Current orientation lives in README.md, this file,
SETUP.md, and `docs/PROJECT-CHARTER.md`.

For a full engineering + QA onboarding brief (architecture, subsystems, debug hooks,
false-positive traps, review assignment) - self-contained and paste-ready for an
external reviewer - see `docs/qa/codebase-review-handoff.md`.
