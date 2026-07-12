# MORNING.md — overnight/balance-and-fuels, 2026-07-12

## What landed (8 commits, all pushed; PR-ready)
- **arc-runner v6+v7**: real door destinations, settle-everywhere, connected-landing,
  interrupt battles no longer eat attempts, gate press-in. The runner now genuinely
  plays: act 1 fully, arena 1-2, cloak recruit, intake-ledger/spring/vault sanctuary
  GATES beaten in real fights.
- **The Correction questline** (psy-ops) — content committed; engine hook (planted
  Archivist record) + live walk still queued.
- **The Floor questline** (financial nihilism) — content committed; live walk queued.
- **Whole-project code review** (tmp/code-review-2026-07-12.md): 4 battle-engine
  correctness defects (shield/Guts order, status-gated RUN, enemy self-buffs, revive
  targeting), story-gate deferred-effect loss (recruit side effects), 92 inert
  stair/escalator self-warp doors, converter silent-corruption paths. Content
  invariants clean.

## Balance measurement status (task #31)
- v7 full run HUNG at objective 31/40 (source-vacancy) after 3.5h; killed 13:30.
- Fight data recorded through act 3 is real; walls form ONE cascade: deadletter-arrival
  fails town entry -> museum trio/undelivered/act3-end wall behind it. Registry is
  roamer-variant (completed in slice, walled in run).
- NEXT: (1) fix deadletter-arrival town entry (likely needs the door/tunnel route,
  not open-field warp-near), (2) find the objective-31 hang (telemetry stopped
  mid-attempt; add a per-attempt watchdog timeout), (3) battle-engine fixes from the
  review BEFORE trusting/tuning the fight table.

## gpt-5.6-sol (Nick's ask)
Exists on the account; requires Codex newer than npm ships (stable 0.144.1 AND
alpha 0.145.0-alpha.4 both reject; alpha+forwarder also unstable). Rolled back to
stable. Retry at the next CLI release. Guards added (~/.codex/AGENTS.md subagent
clause; reasoning default HIGH; no Ultra/fast-mode when 5.6 lands).

## Not done (parked per plan)
The Onboarding + The Unsigned questlines; cutscene wave 2; balance tuning
(blocked on the two runner fixes above); Correction/Floor live walks.
