# Overnight plan 2026-07-12

Goal-prompt discipline throughout: pixels over properties, real-boot gates,
every cheat logged, no em dashes, stage-by-explicit-path, never git add -A.
Branch: fix/arc-runner-selector (rename to overnight/balance-and-fuels at start).
Morning deliverable: MORNING.md at repo root + per-phase commits, nothing pushed
to main; PR at the end.

## Phase 1: finish the balance runner (orchestrator, ~1h)
1. Fix tryDoorHopToward landing at (0,0): door destination mapping (check
   destinationWorldPixel units: doors use 8px warp units x8 per door-destination
   memory) + after any door transition, waitForFunction(__firstSceneDebug fresh
   && __debugHeal registered) before reading flags/healing.
2. Slice test --max-objectives=8 (registry objective must COMPLETE, not wall).
3. Full run v6. Success = game:complete with walls <= 2 and battles recorded
   for registry/arena/museum/sources/raid/milady.
4. If clean: write tmp/balance-worklist.md from the fight table (walls >25r or
   deaths = nerf candidates; <4r no-pressure = buff candidates), then apply
   content/enemy-stat-overrides.json tuning + re-run to confirm. Commit each.

## Phase 2: The Correction goes live (orchestrator + 1 codex job, ~1h)
1. Engine hook per spec: Records view swaps one filed record summary to the
   planted fake while fuel:correction:record-planted && !fuel:correction:cleared;
   restore on cleared. No PHOTO flags touched. Unit test.
2. pnpm build:eb-fullworld (reset chunk noise), tsc, validate.
3. Live walk: guest wrong-memory line -> notice board -> field-agent gate fight
   (group 136) -> restoration cutscene -> fuel:correction:cleared. Screenshots.

## Phase 3: Fuels waves 2-3 (codex, content-only, parallel with 1-2 verify)
- The Floor (Galleria/Venue) then The Onboarding (Solana Beach) per the
  approved doc; same constraints as Correction wave (ids fuel-namespaced,
  optional, no engine edits, node-only validation). The Unsigned LAST (needs
  the blank-name boss engine question answered first; park if unclear).
- Orchestrator gates each: em-dash zero, no existing entries touched, voice
  spot-check, live walk of one beat per quest.

## Phase 4: cutscene wave 2 (codex, if time)
- 15 more located scenes, act-route priority, same exemplar format + gates as
  wave 1. Live-walk 2.

## Phase 5: morning report
- MORNING.md: fight table + tuning applied, quests live-walked, scenes added,
  walls remaining, every forced flag/cheat, screenshots inventory, PR link.

## Parking rules
- Any phase blocked >30min on one defect: park it, log precisely, move on.
- No sprite generation, no map/tile edits, no main pushes overnight.
