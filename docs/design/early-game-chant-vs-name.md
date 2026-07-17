# Early game: the chant vs the name

Status: SPEC (2026-07-17). Not implemented. Companion to the MILADY CULT
found-speech passes (commit 0f6dede4) and the canonical story architecture.

## Thesis

The first ten minutes should plant both keys of the whole arc:

- **The enemy's key is the chant/category.** The meteor scene already chants
  "milady" (four Miladys). The Returnless King already offers four stamps
  (Source / Vessel / Claimant / Derivative). The LSW listening post (shipped)
  already logs refusals as entries.
- **Bosch's key is his own name.** The naming screen is a disputed record. The
  bedroom terminal (shipped) logs him as the author of a line he did not type.
  The LSW door Drifella (shipped) states the rule outright: "doors here like
  names with a body attached."

What is missing is the connective tissue in Act 1: a soft gate that records
Bosch *either way* before any fight, and one physical moment where his own
name demonstrably works where the chant does not. Both beats below are strictly
additive: no shipped trigger, dialogue, or NPC entry is modified.

## Current runtime spine (verified 2026-07-17)

Opening phases (early-game-sequence): flyover -> bedroom (MiFella knock) ->
night route -> meteor -> return home -> morning ("Find MiFella in town").
Then the authored Act 1 chain in triggers.json:

1. `signal-town-card-clique` boss (1512,1744) -> `signal:clique_cleared`
2. `relay-gate-returnless-king` boss (1928,1560) -> `signal:route_open`
   (the current "first proof gate": refusal = fight, "Not agreed, forced")
3. north road -> Malady -> Munch -> `act1:complete`

House front step: 2648,344. Descent runs S then W to the arcade block.
Spawn-notice teaching cluster: x 2080-2160, y 1788.

## Beat 1: The Tally Post (refusals are also entries)

A small enemy proof-post on the morning descent, BEFORE the card clique.
The player's first gate asks for compliance and visibly does not need it.

- **Form:** story trigger (area, once) + examine interactable for re-reads.
  - Trigger id: `tally-act1-post` | flag: `tally:act1:refused`
  - Interactable id: `tally-act1-post-plaque` (kind: examine, for after the
    once-trigger has fired; restates the counter, one page shorter)
- **Placement:** on the main descent road between the front step and the card
  clique so it cannot be missed on the critical path. Candidate zone: the road
  segment north of the arcade block (x ~1600-1750, y ~1300-1450, near the DAO
  sign at 1666,1273). EXACT coords require the standard probe pass: walk-in
  entry (not warp), collision grid, screenshot. Trigger areas fire on real
  entry; verify by stepping across the boundary.
- **Gating:** requireFlags [`intro:morning`] so it cannot fire during the
  night sequence (opening phase gates hide exterior NPCs until then anyway;
  triggers and interactables are NOT phase-gated, hence the explicit flag).
- **Dialogue (draft, final copy at implementation):**
  1. Narration: a fresh-bolted post with a grille and a four-way stamp wheel:
     SOURCE / VESSEL / CLAIMANT / DERIVATIVE. (Previews the Returnless King's
     exact offer, so the boss reads as the same machine grown large.)
  2. POST: asks Bosch to state a designation. Free of charge. Everyone passes.
  3. Bosch says his own name instead.
  4. POST: "ENTRY RECEIVED. CATEGORY: PENDING." A counter ticks once.
  5. Narration gives the landmark: the crowd noise from the arcade block,
     west, where the category was supposed to matter.
- **Effects:** setFlags [`tally:act1:refused`]. No battle, no block. The gate
  opens the path while recording the refusal: the player learns the enemy
  does not need a yes.

### Payoff A (Act 1): the pending witness

New added NPC (id from the 930xxx block, next free: 930116) near the relay
gate approach (~1928,1620), requireFlags [`tally:act1:refused`], blockFlags
[`signal:route_open`], alwaysSpawn, group 59 + byNpcId skin. A clerk-adjacent
bystander, NOT LSW (so no "twin"):

> "You're the pending one. The desk hates pending. It can stamp a lie in a
> second and it still cannot stamp a blank."

Additive alternative to editing the Returnless King's shipped dialogue, which
is off-limits by invariant.

### Payoff B (already shipped)

The LSW listening post and thirty-seconds shrine become callbacks instead of
new ideas. No work needed.

## Beat 2: Name-as-key (the counter-move physically works)

One object on the critical path that Bosch's own name opens.

- **Form:** present interactable on the front porch, opened via name-fiction.
  - Id: `tally-act1-named-parcel` (kind: present, worldPixel near the front
    step 2648,344; exact spot via probe; must not collide with the archivist
    photo anchor at 2656,344 or the night-door allowance at 2648,336).
  - Item: a small heal (match the spawn present's tier, item 88 class).
- **Pages (draft):**
  1. "A parcel sits on the step, addressed in handwriting, not type. The seal
     asks nothing. It is waiting for a voice, not a stamp."
  2. "Bosch says his own name. The seal agrees instantly, like it had been
     embarrassed by the question."
  3. Item-get lines per the present schema.
  - openedPages: "The parcel is open. The name did that. No category required."
- **Why a present:** presents are the one interactable kind with persistent
  opened state (openedFlag) and item delivery; the fiction ("the name is the
  key") needs no new engine mechanic.
- **Rhyme map:** naming screen -> terminal (authorship stolen) -> parcel (name
  works) -> tally post (name = pending, refused) -> Returnless King (stamps,
  forced open) -> LSW door Drifella ("names with a body attached") -> Dead
  Letter finale (the one file she cannot open).

## Invariants and hazards (from the shipped passes)

- Additive only: new ids `tally-act1-*`, flags `tally:act1:*`. Never edit the
  shipped opening/cutscene/trigger entries; early-game-sequence ownership
  suppression applies to opening dialogue keys, not to new exterior content.
- Exterior added NPCs are hidden until `intro:morning` (opening phase gates)
  and need `alwaysSpawn: true`; probe with `&flags=intro:morning`.
- `__solidAt` reads roofs as open; screenshot every placement.
- Z-drain harnesses need ~2 presses per page or trigger setFlags never apply.
- Full `pnpm build:eb-fullworld` + chunk-noise reset (`generated/assets/world/
  chunks/` AND `editor-chunks/`; the test suite also regenerates them).
- Bump the group-59 census in atlasSprites.test.ts (+1 -> 723) for the witness.

## Acceptance (goal-prompt style)

GOAL: a new player walking the morning descent hits the tally post before any
battle, refuses by existing, sees the counter tick, and later meets the
pending witness at the relay gate; the porch parcel opens by name.

ACCEPT (evidence, real boot, pixels):
1. Fresh boot, play through morning (or `flags=intro:morning`), WALK the
   descent: trigger fires on entry, full dialogue, `tally:act1:refused` in
   debug flags after completion. Screenshot with dialogue open.
2. Witness absent before the flag, present after, speaks the pending line,
   despawns once `signal:route_open` is set. Screenshots both states.
3. Parcel opens with the name pages, grants the item, shows openedPages on
   re-read. Screenshot.
4. Returnless King and the whole Act 1 chain still complete (scripts/act1.mjs
   or manual chain), 167 test files green, zero em dashes.
