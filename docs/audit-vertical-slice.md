# Vertical Slice Audit

## Result

AUDIT_PASS

## Pass/Fail Checklist

### 1. Generated Output Contract

- PASS: `pnpm convert` writes the four generated JSON files:
  - `manifest.json`
  - `scripts.json`
  - `sprite-groups.json`
  - `validation-report.json`
- PASS: `manifest.json` references `scripts.json`, `sprite-groups.json`, and `validation-report.json` through `files` instead of embedding their payloads.
- PASS: generated output is ignored by `.gitignore`.
- PASS: `apps/game/public/generated/.gitkeep` is explicitly unignored as the only tracked sentinel file. It is not emitted by the converter.
- PASS: converter now removes stale generated output before writing the four JSON files, while preserving `.gitkeep`.

### 2. ROM/Local Asset Safety

- PASS: generated public JSON contains no ROM filename, `.sfc` path, or `/Users/` absolute path in the default fixture run.
- PASS: implementation source contains no absolute ROM path outside the user-provided `docs/goal.md` fixture provenance.
- PASS: no extracted PNGs are copied into `apps/game/public/generated`; sprite output only indexes relative `SpriteGroups/*.png` paths and metadata.
- PASS: `external/coilsnake-project/` remains ignored local-only input.
- NOTE: this directory is not currently a Git repo, so commit inclusion could not be verified with `git status` or `git ls-files`.

### 3. Parser Robustness

- PASS: `robot.ccs` parses `hello_world` as a label.
- PASS: inline `"@Hello World!" end` parses as `text` plus `end`, not `unknown`.
- PASS: unknown commands preserve `raw` and `sourceLocation`.
- PASS: blank lines and `//` comments are ignored safely, with `//` inside quoted text preserved.
- PASS: parser tests use synthetic fixtures only and do not require real CoilSnake extracted data.

### 4. Validation Semantics

- PASS: missing project exits `0` and emits a structured warning.
- PASS: missing manifest exits `1` and emits `missing_manifest`.
- PASS: invalid generated JSON exits `1` and emits `invalid_generated_json`.
- PASS: missing `robot.ccs` or `hello_world` is modeled as warning behavior in conversion, not a crash.
- PASS: unknown CCScript commands warn/count but do not fail.

### 5. Phaser/Data Separation

- PASS: Phaser loads `/generated/manifest.json` through the loader and `scripts.json` through `fetch` using the manifest path.
- PASS: manifest and script payloads are validated with Zod before display.
- PASS: script selection is in standalone `findDialogue`, outside the scene class.
- PASS: fallback text is generated status text.
- PASS: no EarthBound assets, logos, sounds, or sprite rendering are used.
- PASS: UI is a primitive debug dialogue box using Phaser graphics and system fonts only.

### 6. Tooling

- PASS: `pnpm install` worked in the completed slice.
- PASS: `pnpm convert` works from the repo root.
- PASS: `pnpm validate` works from the repo root.
- PASS: `pnpm test` works from the repo root.
- PASS: `pnpm exec tsc --noEmit` passes.
- PASS: `pnpm dev` starts Vite/Phaser and serves the debug app; it was verified over localhost and then stopped.

## Concrete Issues Found

1. `.gitkeep` exception was missing from `.gitignore`.
   - Fixed by restoring `!apps/game/public/generated/.gitkeep` and adding the sentinel file.

2. Converter did not remove stale files from `apps/game/public/generated`.
   - Fixed by clearing generated output before writing the four JSON files, preserving `.gitkeep`.

3. Parser comment/blank-line behavior was implemented but not covered by tests.
   - Fixed with a synthetic CCScript test for blank lines, full-line comments, trailing comments, and `//` inside quoted text.

4. Absolute CLI paths in warning `path` fields were not marked debug-only.
   - Fixed by applying the same `[debug-absolute]` marker to issue paths as source project paths.

## Exact Files Touched

- `.gitignore`
- `apps/game/public/generated/.gitkeep`
- `packages/eb-converter/src/index.ts`
- `packages/eb-converter/test/converter.test.ts`
- `docs/audit-vertical-slice.md`

## Verification Commands

```sh
pnpm convert
pnpm validate
pnpm test
pnpm exec tsc --noEmit
```

Additional edge checks were run with temporary output directories:

- missing project conversion exits `0`
- missing generated manifest validation exits `1`
- invalid generated manifest validation exits `1`

## Recommended Next Milestone

Add a second schema-first generated-data slice for a tiny NPC metadata or placement fixture. Keep it read-only against the CoilSnake project, preserve unknown data, and continue displaying only debug generated data in Phaser until the data contract is stable.
