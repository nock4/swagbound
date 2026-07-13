# Tutorial ROM Video Verification (superseded)

> **Historical document (CoilSnake-tutorial era, 2026-06).** This repo is now
> Swagbound, a complete EarthBound total-conversion game; see the root README.md.
> Kept as a record; do not follow as current guidance.

This document previously logged an early line of work that compiled a hack ROM and captured
emulator videos to verify imported tutorial content. That approach is **superseded** and its
ROM-compilation / emulator references have been neutralized for consistency with the project's
current charter and licensing boundary.

## Why it was neutralized

The project now treats the EarthBound ROM and all ROM-derived data as **reference/development inputs
only**: local, gitignored, never committed, never reproduced. The current pipeline verifies imported
content in the **web engine** (Phaser) against schema-validated generated data — not by compiling or
running a ROM in an emulator. See:

- `docs/design-language-checkpoint.md` — the canonized engine + licensing boundary.
- `docs/act1-parity-phase-plan.md` — the current plan and parity ledger.
- The `parity:scorecard` and the e2e suites (`test:mantis`, `test:fullworld`, `test:battle`) — how
  imported content is verified today, with all assertions structural (counts/state, no copyrighted
  text or asset bytes).

## Standing safety boundary (unchanged)

- The ROM is not inspected, modified, compiled, or committed by current work.
- No ROM bytes, extracted assets, or copyrighted text/names are committed; they exist only under
  gitignored paths and are read at runtime.
- Generated public JSON is scanned for ROM-filename / `.sfc` / absolute-path leakage (validator + e2e
  + manual scan); that scan is clean.

The original emulator-era log was replaced rather than partially edited because it was, end to end, a
record of the superseded ROM-compilation approach. Git history retains the prior revision if it is
ever needed for reference.
