# Project Charter — read this first

## North star

**Build a faithful EarthBound, rebuilt in Phaser, using the real extracted maps, art, dialogue, and
systems.** `pnpm dev` boots real EarthBound (full-world Onett with the actual extracted assets). The
engine is original code; the content is EarthBound's.

This is the deliverable. Everything is measured against it.

## Default vs. later phases

- **Default / front door = faithful EarthBound.** The default build, `pnpm dev`, and the default test
  suite always target the real EarthBound experience.
- **Original content / "own twist" (e.g. Swagbound) is a LATER, explicitly-requested phase.** The
  content pipeline (`packages/content-builder`, `content/`) exists as a parked capability and is
  **opt-in only** (`pnpm content:test`). It must **never** be made the default without an explicit
  instruction that says so in those terms.

## Licensing boundary (unchanged, always)

EarthBound's ROM and everything extracted from it (maps, sprites, dialogue, music, names) are
reference/development inputs only: **local, gitignored, never committed, never reproduced**. The
faithful rebuild is therefore a personal/dev/fan build — buildable and playable locally, **not
distributable**. A shippable product would require swapping in original assets (the "twist" phase).

## Anti-drift guardrails (for any agent/orchestrator working here)

1. **Alignment gate, not just correctness.** Before committing any change, confirm it moves toward the
   north star. A green test suite on the wrong target is still drift.
2. **"Proceed" / "do it all" authorizes SCOPE, not DIRECTION.** Continuing the agreed work = go.
   Changing the **default**, demoting/removing the main deliverable, or redefining the product = STOP
   and confirm with one cheap question first — even under a broad "keep going."
3. **Off-looking output is a STOP signal.** If an artifact looks wrong (e.g. crude placeholder art
   where real art is expected), flag it and question alignment — do not narrate it as success.
4. **Ambiguous instruction → surface the interpretation.** If a directive could mean a small change or
   a project-redefinition, state the reading and the alternative in one line and let the user redirect
   before acting at scale.

## History note

On 2026-06-13 the default was wrongly flipped to a placeholder original-content slice (misreading
"put our own twist on it" as "pivot now"). It was reverted to faithful EarthBound. These guardrails
exist so that does not recur.
