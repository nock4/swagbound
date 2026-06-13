# Design-Language Checkpoint

Status as of this checkpoint: a single coherent vertical slice exists end to end — you can **walk** a
streamed full-size overworld, **talk** to its populated cast through a real text engine with event
flags, and **fight** a real encounter with the signature rolling HP meter. That is enough surface to
canonize a design language and start diverging into an original game. This document is that synthesis:
the conventions we settled on, the stable contracts between layers, and the seams to build our own
twist on top of.

This is a description of *our engine's* patterns. The EarthBound-derived data used to validate them is
reference-only and local (see Licensing). Nothing here reproduces copyrighted text, names, or art —
the language is about structure, mechanics, and the original content pipeline.

## 1. The layered architecture (the thing to keep)

The campaign's central, repeatable decision: **a content-agnostic runtime fed by validated generated
data, produced by a converter from a swappable source fixture.**

```
source fixture (local, gitignored)
        │   converter (packages/eb-converter)  ── deterministic extraction + rendering
        ▼
generated data + assets (local, gitignored)    ── validated JSON contracts (packages/eb-schemas)
        │   loader (apps/game/src/loader.ts)    ── schema-parsed at boot
        ▼
runtime scenes (Phaser)                         ── knows contracts, not the source
```

Why it matters for the twist: the runtime never references the ROM or any specific game. Swap the
source fixture (or hand-author generated data conforming to the schemas) and the same engine renders a
different game. Every layer is independently testable; every slice was gated converter-first, then
runtime, then e2e.

## 2. The five grammars

### 2.1 World / tile grammar
- The map is a tile field composed from sector metadata (tileset + palette per sector) over reusable
  tile arrangements. Background and high-priority foreground are separate render layers
  (foreground draws above actors).
- Collision is an 8px-cell surface grid (solid / walkable), independent of tile size. Actors test a
  small feet-box against it; movement resolves per-axis so actors slide along walls.
- The full world streams as fixed 512px chunks around the camera (3×3 active, 5×5 retained), with a
  region mode for small fixed scenes. Both share the same collision and actor code.
- **Convention for the twist:** author maps as the same sector/arrangement/collision data; the
  streaming + collision runtime is reusable as-is. Region mode is the right target for small custom
  scenes; chunk mode for large worlds.

### 2.2 Entity / NPC grammar
- Entities are placements (id, position, sprite group, facing) plus a behavior and a visibility rule.
- Behaviors are a small set today (static, patrol with range/speed, bounded wander) built on the
  shared movement state machine — NPCs reuse the player's step/facing/animation logic with synthetic
  input.
- Visibility is dynamic, driven by event-flag state via three rules (always / visible-when-flag-set /
  visible-when-flag-unset). This is the hook for world state changing who is present.
- Interaction is facing-aware (in front + in range), not radius-only.
- **Convention for the twist:** add new behaviors as pure step functions; keep visibility flag-driven
  so story progress reshapes the cast. Author NPCs through the same placement + config contract.

### 2.3 Event / script grammar
- Scripts are command streams referenced by `file.label` pointers. Resolution **follows control flow**:
  linear advance, `goto`/`call` (with a return stack) across files, and conditional branches evaluated
  against live flag state — all bounded by cycle detection and a step budget so resolution can never
  loop.
- Side effects (`set`/`unset` flags) apply along the resolved path, so talking/acting changes world
  state, which in turn changes later resolutions and entity visibility.
- A minimal **event runner** turns an interaction into a list of typed events (today: dialogue,
  setFlag). This is the extensibility seam — new event kinds (give item, warp, start cutscene, start
  battle) slot into the same union.
- **Convention for the twist:** model story as flags + flag-gated branches + typed events. The runner
  is where original mechanics attach.

### 2.4 Dialogue presentation grammar
- Text is a structured **segment** model (text runs, line/page breaks, prompts, pauses, substitutions,
  window ops, and a raw control catch-all), not flat strings. Pages split on prompts and explicit
  breaks; substitutions resolve through an injectable resolver.
- Presentation: a bordered window, optional typewriter reveal (with a two-stage confirm: finish, then
  advance), instant by default for determinism.
- **Convention for the twist:** keep dialogue as segments + a resolver; original writing flows through
  the same model, and substitutions (names, numbers, items) stay data-driven.

### 2.5 Battle grammar
- The signature is the **rolling HP odometer**: damage sets a target and the displayed value rolls
  toward it; death triggers only when the *displayed* value reaches zero — so a fatal blow is
  survivable if the turn is won (or HP restored) before the meter lands. This is a pure, unit-tested
  module and is the single most important "feel" primitive to preserve.
- Combat is a turn loop over combatants with an injectable RNG (deterministic tests), a command menu,
  and win/lose keyed off displayed HP. Encounter data (enemy stats, groups, backgrounds, sprites) is
  extracted but the *mechanics* are ours.
- **Convention for the twist:** the odometer + turn loop are content-agnostic; original enemies and
  balance are just data. New commands (PSI-like skills, items) extend the menu + logic.

## 3. The data contracts (the stable interface)

These zod-validated shapes in `packages/eb-schemas` are the real API between content and engine. They
are what an original game would target:

- **WorldRegion / WorldChunked** — region geometry, chunk index, collision rows, NPC placements,
  doors/warps, player spawn.
- **SpriteSheet** — frame layout + per-direction walk-frame `animations`.
- **ScriptCollection + DialoguePage segments** — command streams, labels, and the segment model.
- **WorldNpc** — placement, sprite group, facing, behavior inputs, `eventFlag`, `showSprite` rule,
  text pointers 1/2.
- **BattleData** — enemies (numeric stats, actions, sprite/group refs), groups, backgrounds.

Discipline that kept this clean: large data lives in referenced files, not inline; every generated
file is schema-validated by `pnpm validate`; a safety scan forbids source-path/ROM leakage in public
JSON; the default build stays byte-identical when optional modes (full world, battle) are off.

## 4. Seams for the twist (how we diverge)

The engine is already content-agnostic, so building an original game is a content + extension exercise,
not a rewrite:

1. **Swap the source.** Replace the gitignored extracted fixture with our own authored source (or
   emit generated data directly) conforming to the schemas in §3. The runtime doesn't change.
2. **Author via the hack-script pattern.** `scripts/apply-npc-hack.ts` is the template for
   reversible, idempotent, line-targeted content authoring — generalize it into an original-content
   authoring toolchain.
3. **Extend the event runner.** New `GameEvent` kinds are the cleanest place to add original mechanics
   (custom interactions, cutscene steps, branching quests) without touching the resolver core.
4. **Add behaviors and battle commands** as pure modules — they inherit the test + gate workflow.
5. **Re-skin presentation** — window chrome, fonts, text speed, battle layout, and the odometer's
   styling are all isolated and swappable; the original art/voice goes here.

The recommended divergence point per the project goal: start original-content authoring on top of this
engine now. Traversal + script + battle is sufficient to express a vertical of an original game; the
remaining EarthBound systems (menus/inventory, party, audio) can be built as the original game needs
them rather than chased for parity.

## 5. Licensing / safety boundary (non-negotiable)

- The EarthBound ROM and everything extracted from it (maps, sprites, script text, enemy data, names)
  are reference/development inputs only: **local, gitignored, never committed, never reproduced** in
  source, tests, docs, or reports. The committed repo contains our original code, synthetic test data,
  and our own authored sample content.
- A public-JSON safety scan (validator + e2e + manual) enforces no source-path/ROM leakage in any
  generated output the app serves.
- Shipping an original game means original maps, art, writing, and audio flowing through the same
  pipeline — the parity work proved the engine; the product replaces the content.

## 6. Where we are vs. EarthBound Act 1 (honest parity ledger)

- **Traversal:** full overworld streams; all placements, doors/stairways/escalators; facing-aware
  interaction. Gaps: ropes/ladders, interiors-as-separate-maps semantics, canonical new-game spawn.
- **Script:** text engine + flow + event flags + conditionals; ~99.7% of NPC pointers resolve to real
  text; flag-gated branches evaluate and flip on real data. NPC movement/action scripts are not
  decompiled by CoilSnake: `npc_config_table.yml` carries only a numeric `Movement` id, so the runtime
  uses an explicit-author override plus a conservative approximation keyed off that id. True movement
  fidelity would require ROM-level movement-bytecode reverse engineering outside this pipeline. Other
  gaps: the long tail of control codes, save/persistence of flags.
- **Battle:** one real encounter with the rolling odometer, turn loop, BASH/RUN. Gaps: full command
  set (PSI, items, status), party of more than one, multi-enemy targeting, swirl/transition, balance.
- **Not started (by design):** menus/inventory/equipment, money/ATM/phone/save, party followers,
  audio.

This ledger is the menu for whichever direction comes next — finish a parity gap, or pivot to original
content using the engine as-is.
