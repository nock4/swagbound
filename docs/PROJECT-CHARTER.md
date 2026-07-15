# Project Charter — read this first

*Updated 2026-07-13. Supersedes the 2026-06 charter, which defined the deliverable as
"faithful EarthBound with original content as a parked, opt-in phase." That phase is
no longer parked: Swagbound IS the game. The old charter's guardrails are preserved
below because they are still right.*

## North star

**Swagbound: a complete, original-story EarthBound total-conversion, built on an
engine that reimplements EarthBound faithfully.** The default build, `pnpm dev`, and
the deployed game (https://swagbound.pages.dev) are Swagbound: Bosch versus Milady,
four acts, the four fuels, original cast, dialogue, soundtrack, and questlines.

EarthBound-parity in the ENGINE remains the foundation and the quality bar (battle
math, movement, doors, menus follow EB semantics; see the rom-truth/parity program in
`docs/` and memory). Parity work serves Swagbound, not the other way around.

Current narrative authority: [Canonical Story Architecture](design/canonical-story-architecture.md).
It defines the campaign's mystery contract, reveal order, beat-level knowledge
changes, NPC story states, and comprehension gates for future content work.

## Licensing boundary (unchanged, always)

- The EarthBound ROM and its CoilSnake decompile are **local, gitignored build
  inputs — never committed, in any form**.
- The runtime data in `apps/game/public/generated/` mixes original Swagbound
  art/content with EB-derived data where not yet overridden. What ships publicly is
  the repo owner's call; the committed-source rule above is not negotiable.
- The 27 runtime soundtrack tracks are owner-cleared for distribution; all other
  audio stays gitignored and is pruned from builds (`scripts/prune-dist-audio.mjs`).

## Anti-drift guardrails (for any agent/orchestrator working here)

1. **Alignment gate, not just correctness.** Before committing any change, confirm it
   moves toward the north star. A green test suite on the wrong target is still drift.
2. **"Proceed" / "do it all" authorizes SCOPE, not DIRECTION.** Continuing agreed work
   = go. Changing the **default**, demoting/removing the main deliverable, or
   redefining the product = STOP and confirm with one cheap question first — even
   under a broad "keep going."
3. **Off-looking output is a STOP signal.** If an artifact looks wrong (e.g. crude
   placeholder art where real art is expected), flag it and question alignment — do
   not narrate it as success.
4. **Ambiguous instruction → surface the interpretation.** If a directive could mean
   a small change or a project-redefinition, state the reading and the alternative in
   one line and let the user redirect before acting at scale.

## History notes

- 2026-06-13: the default was wrongly flipped to a placeholder original-content slice
  (misreading "put our own twist on it" as "pivot now"); reverted to faithful
  EarthBound. The guardrails above were written then.
- 2026-06 to 2026-07: Act 1 reached ~99 percent EB parity; the owner then explicitly
  directed the Swagbound build-out (custom towns, cast, story arc, soundtrack, fuels).
  The full 4-act arc shipped publicly on 2026-07-13. This charter was updated to match.
