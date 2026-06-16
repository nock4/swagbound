# Overnight Parity Pass — "Act 1 Slice: New Game → First Boss"

Goal: bring the whole early-game slice to vanilla-EB parity end to end — every map,
every transition, the battles, and the story spine from a fresh New Game through the
first boss. Orchestrated as sequential Codex tasks (each with an explicit `<goal>` +
DONE criteria) gated by the orchestrator's **native 512×448** in-browser checks.
Honest about the RE ceilings (the event/actor system) up front.

"First boss" target: **Frank / Frankystein Mark 2** in Onett (the first dedicated
boss fight after the intro's Starman Jr), with **Titanic Ant** at Giant Step as the
stretch milestone.

## Phase 0 — Close the open loops (must land first)
- **Interior camera/mask** (in flight): player always centered, map scrolls, only the
  current room renders (no neighbor bleed). Verify native + commit.
- **Fonts in the right places**: lock the default font (pending the user's pick from
  the comparison), then per-context selection — honor in-text font-switch codes →
  Mr. Saturn font (1) for Saturn speech, small font (4) where EB uses it.

## Phase 1 — Maps refinement (Onett + the first-boss corridor)
- Diagnostic sweep: walkability-grid-vs-frame across Ness's neighborhood, downtown
  Onett, and north to Giant Step. Flag mis-collided cliffs/edges, mis-rendered tile
  seams, palette/animation tiles, and any chunk-seam artifacts.
- Fix the concrete map defects found (collision mask + tile/arrangement issues only;
  data stays gitignored).
- Gate: walk the corridor new-game→Giant-Step entrance with no clip-through / no
  walkable-wall / no render seams.

## Phase 2 — Transitions (full Act-1 door + warp audit)
- Round-trip EVERY Act-1 door (Ness's house up/down, neighbor houses, drugstore,
  hospital, police station, Pokey's house, the Giant Step entrance): enter → correct
  interior → exit → correct exterior spot. Both directions.
- Fix the residual ~8% over-range door destinations and any mismatched returns with
  per-door ground truth.
- Resolve the scripted-teleport coordinate-unit lead (teleport destinations read as
  world px vs 8px warp units) so story warps land correctly.
- Gate: a scripted in-browser tour that enters+exits each door and asserts walkable,
  correct-area landings.

## Phase 3 — Battles (depth parity for the early roster + bosses)
- Audit damage/turn-order/enemy-AI against EB for the Onett roster (e.g. Spiteful
  Crow, Coil Snake, Runaway Dog, Skate Punk, Pogo Punk, Territorial Oak) — correct
  stats, AI action selection, EXP/money/drops.
- Bosses: Starman Jr (intro), **Frank + Frankystein Mark 2** (first boss), Titanic Ant
  (stretch) — correct stats, multi-form/phase behavior, scripted entry.
- Flow/timing polish to EB feel (command → roll → result cadence).
- Gate: fight each scripted boss to victory in-browser; spot-check roster encounters.

## Phase 4 — Early story spine (the RE-heavy phase, through first boss)
- Intro P3–P5: Pokey at the door + his dialogue, travel to the meteor (player-driven +
  scripted beats), Buzz Buzz exposition (data_15) → Starman Jr, Pokey/Picky join,
  return home.
- Onett beats to the first boss: the morning-after gating (police line / roadblocks),
  Pokey's house, the path that leads to the first boss encounter, with the real
  (pointer-referenced) dialogue.
- HONEST SCOPE: EB's intro/story past the knock is engine-orchestrated, not a linear
  script. This phase reconstructs the spine using our event executor + real text
  fragments + the battle system, and extends the executor with the minimum actor ops
  needed (show/hide/move NPC, party_add) — the genuine ceiling. Each beat is
  player-driven where EB is, scripted where EB is. Report coverage per beat.
- Gate: a fresh New Game can be played start → first boss without dead-ends.

## Phase 5 — Integration + scorecard
- Full New-Game → first-boss playthrough verification at native size.
- Update `docs/design-parity-pass.md` with the slice's parity grades.
- Honest report: what's pixel/behavior-faithful vs approximated, and the next slice.

## Process guarantees (per user direction)
- Every Codex task uses a `<goal>` block + DONE criteria + honest self-verification;
  Codex verifies code/tests/build, the orchestrator owns the **native-viewport**
  visual gate ([[ui-verify-native-viewport]], [[subagent-goal-prompts]]).
- One Codex thread at a time; commit per landed+verified change; ROM read-only,
  extracted text/values stay gitignored and referenced by pointer.

## Pass results (executed 2026-06-16)

Final state: 392 unit tests, tsc 0 errors, e2e review/eb/battle/content all green.

- **0a interior camera/mask** [0c62670] — DONE + native-verified. Player stays
  centered, map scrolls, only the current room renders (no neighbor bleed).
- **0b font-aware text engine** [d778711] — DONE. Renders any of the 5 EB fonts;
  honors the real font-select codes ([1F 30]→0, [1F 31]→Mr. Saturn font 1);
  default font 0 unchanged.
- **1 maps** [audit] — CLEAN, no fixes needed. Collision verified (only ~5
  negligible 1-cell pockets across Onett), rendering faithful (downtown + corridor
  spot-checked); the real map defect was the interior bleed, fixed in 0a.
- **2 transitions** [7264e27] — DONE + native-verified. Door destinations healthy
  (2/1164 unrecoverable, CU5-guarded inert); 96% have return doors; teleport
  destinations are world-pixels; Ness's-house enter+EXIT round-trip confirmed
  in-browser; door probe widened to footprint range for set-back exit doors.
- **3 battles** [c86fddc] — DONE + native-verified. Extended the bounded extraction
  to include the Act-1 bosses: Frank (group 448), Frankystein Mark 2 (449), Titanic
  Ant (450), Starman Jr (474); added `speed` stat; Onett roster spot-audited
  faithful. All bosses fight in-browser on the animated background, 0 errors.
- **4 story spine** [f32b954] — PLAYABLE SPINE (honest reconstruction). New Game →
  bedroom opening → Onett → meteor/Buzz Buzz → Starman Jr → flag-gated Frank
  first-boss trigger (real dialogue by pointer + group 448). Faithful: pointer
  dialogue + real battles. Reconstructed: Frank reached via an arcade-region
  trigger. Stubbed + logged (the actor-VM ceiling): Pokey/Picky escort + party_add,
  roadblock NPC movement, Buzz Buzz death/Sound Stone. Full new-game→Frank walk is
  playtest-pending (long multi-step navigation, not auto-scriptable).

### The honest remaining ceiling (next slice, multi-session)
- **Actor/event-VM**: scripted NPC movement (Pokey walking/leading), party_add
  cutscenes, moving roadblock NPCs — needed for the *faithful* (vs reconstructed)
  story beats.
- **Buzz Buzz death + Sound Stone** hand-off, the morning-after gating, and the
  Giant Step approach → **Titanic Ant** as the Sanctuary-boss milestone.
- **Pray/Mirror** full EB tables (currently bounded approximations).
- A couple over-range door destinations + ~4% of doors without a detected return
  (one-way/scripted warps) — per-door ground-truth if a bad warp shows in play.
