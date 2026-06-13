# Event-Driven Scripting Slice Report

Date: 2026-06-12
Slice: multi-page dialogue from imported `next` commands, flag-gated repeat dialogue via `Text Pointer 2`,
session flag store behind the event runner. Codex subagents wrote all code (packages D/E/F); Claude
orchestrated, gated, and committed.

## What changed

- **Hack v2** ([apply-npc-hack.ts](../scripts/apply-npc-hack.ts)): greeter (NPC 745) dialogue is now two
  pages (page 1 text unchanged; paging via the ccscript `next` command the converter already parses), a
  new `greeter_again` label, and `Text Pointer 2: robot.greeter_again` on 745. Migration converges from
  pristine, v1-applied, and v2-applied fixture states (hash-verified).
- **Data contract**: `WorldNpc.textPointer2` (schema + converter + synthetic round-trip test).
- **Runtime**: [gameFlags.ts](../apps/game/src/gameFlags.ts) (session store, `npc:<id>:talked`
  convention) and [eventRunner.ts](../apps/game/src/eventRunner.ts) v2 — events are now
  `[dialogue, setFlag]`; dialogue reference selection uses `textPointer2` when the NPC's talked-flag is
  already set. Documented as a repo-owned approximation of EarthBound's event-flag gating (real flag
  semantics are not decoded yet).
- **E2E** ([event-scripting.spec.ts](../tests/review/event-scripting.spec.ts)): page advance/close
  against imported two-page data, repeat interaction resolving the second pointer, flag lifecycle
  assertions, and cross-NPC isolation (744 unaffected by 745's flag).

## Verification

- Unit: 73 tests green. Types clean. E2E: 21 tests green ×3 consecutive runs. `pnpm verify` chain green.
- Live probe before the e2e package existed: page 1 → page 2 → close → reopen showed
  "@Told you already. Parts. Tomorrow." with `npc:745:talked` in debug flags.
- Safety: generated JSON scan clean; ROM untouched; fixture edits reversible and gitignored.

## Known gaps

- Flag store is session-only (no save/load); flag semantics are repo-owned, not decoded EB flags.
- `setFlag` fires at interaction start (marks "talked" even if the player closes page 1 early).
- Dialogue text engine still supports only text/next/end — no EB control codes.

## Next

Superseded by the new project charter (2026-06-12): **Act 1 vanilla parity** — see
docs/act1-parity-roadmap.md. ROM access for data extraction was explicitly authorized by Nick
(full CoilSnake decompile + dialogue text extraction; everything extracted stays local/gitignored).
