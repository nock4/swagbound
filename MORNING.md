# Session report — overnight/balance-and-fuels, 2026-07-12 (continuation)

15 commits this session, all on `overnight/balance-and-fuels`, nothing pushed to
main. Tree clean. Highlights: the full 4-act arc now plays end-to-end with a
trustworthy leveled fight table, the Correction + Floor questlines are verified
live, and a whole class of multi-hour "hangs" turned out to be a runner bug, not
a game bug.

## Headline wins

- **The arc plays start to finish.** The balance runner reached `game:complete`
  (all the way to `milady:unmade`) twice. v7's infamous 3.5-hour hang at
  source-vacancy is now a bounded ~15min wall; the run never hangs.
- **The "multi-hour hangs" were never a game freeze.** Every one followed a
  party DEFEAT: EarthBound's defeat flow opens a separate game-over scene
  (CONTINUE/TITLE menu) that the runner was not driving, and its world debug
  hooks are unregistered there. Correct, player-facing behavior. The runner now
  reloads deterministically on defeat. (task #8 closed — no ship-blocker.)
- **First trustworthy balance table.** The runner's party was frozen near base
  level all run (defeat-reload wipes XP), so v9's "hard" fights were
  underleveling, not overtuning. Added a DEV `__setPartyLevels` hook + per-act
  leveling; v10 ran leveled with 0 wedges and gave real signal.

## What landed (committed)

1. **CLIProxyAPI + gpt-5.6-sol** — local proxy on 127.0.0.1:8317 to Nick's Codex
   pro account; canary code-review on gpt-5.6-sol passed strongly. codex-rescue
   forwarder stays default. (memory: cliproxyapi-gpt56-proxy)
2. **Arc-runner, v8→v10** — physical warp-landing validation (mobility probe),
   live boss-gate targeting for roamers, attempt-level flag + party recovery,
   real saves, per-attempt watchdog, defeat→deterministic-reload, and per-act
   party leveling. Turned a fragile, hang-prone runner into one that plays the
   whole arc.
3. **The Correction questline** — Records-view planted-fake caption engine hook
   (5 unit tests) + FULL chain verified live (baseline → walk into Vacancy Flats
   plants the Editor's fake caption → field-agent defeat fires the restoration
   cutscene → caption restored). Screenshot proof sent.
4. **The Onboarding questline** — content wave (7 files) authored + built live;
   entry beats (pew session, pre-member card) verified firing in-game.
5. **Cutscene wave 2** — 15 located EB scenes; verified firing in the v10 run.
6. **Build propagation** — CRITICAL: the game reads `apps/game/public/generated/*`
   which was stale, so ALL committed fuel content (Correction/Floor/Onboarding)
   was INERT until `pnpm build:eb-fullworld`. Now live.
7. **Balance tuning** — buffed the two trivial act-2 story gates
   (postwick-registry Insane Cultist, source-intake-ledger Extra Cranky Lady);
   confirmed via forceEncounter probe (1-round facerolls → 5/3-round fights).
8. **Converter hardening** — fts truncated-line guard, per-coordinate door
   scaling, inert-door warning. world.test.ts +35 pass.
9. **DEV `__setPartyLevels` hook** — levels the party via the real growth path.

## Verified live (real boot, port 4180)

- Correction: full chain, with screenshot (`tmp/correction-walk/records-2-planted.png`).
- Floor: sponsor accept sets `fuel:floor:sold`; refuse then correctly BLOCKED
  (mutual exclusion holds); examine interactables fire authored text.
- Onboarding: session-complete + card-issued fire (content live). Full 7-beat
  walk blocked by the runner's harness not navigating the tight chapel terrain —
  NOT a content bug (same pattern as verified Correction/Floor).
- `__setPartyLevels(30)`: party correctly re-leveled (Bosch 289 HP etc.).

## The balance verdict (tmp/balance-worklist.md)

The runner plays with only BASH/DEFEND — a WEAK player. So **buff signals are
reliable** (a faceroll for a weak policy is a faceroll for a strong one) but
**nerf signals are ambiguous** (a real player has PSI/items). Acted only on the
reliable buffs. Notably, arena-venue-3 (Soul Consuming Flame, 262 defense) was
left ALONE: its defense makes it a deliberate PSI-check, so the runner's
physical-only defeat is a policy artifact, not overtuning.

## Open / parked (see task list)

- **#5 The Unsigned** — parked; needs engine design for The Nobody boss (blank
  battle-UI name + copies-stats-from-checker + damage-only-when-not-checked).
- **#7 Ship prep** — release build, ship gitignored `*-loop.mp3`, public playable.
  Not started.
- **#9 Runner battle policy** — the real unblock for NERF-side balance tuning:
  give the runner PSI + items + target focus so its loss signals become
  trustworthy. Also stalemate detection + arena-venue routing.
- **#10 Atlas goldens + inert doors** — 2 pre-existing atlas golden tests drifted
  from the new Onboarding NPCs (regenerate); the 92 stair/escalator doors are
  now warned but still inert (destinations absent in source; needs EB-format work).
- **Onboarding full walk** — finish with a walkable-approach probe per chapel beat.

## Cheats/knobs to know

- Act-level curve is a guess in `scripts/arc-runner.mjs` (ACT_LEVEL_CURVE:
  L8/12/16/22/30/40/42). Retune + re-run if the intended progression differs.
- Balance buffs tuned to the weak runner policy = a safe ceiling (real players
  find them no harder).
