# Goal: CoilSnake → Phaser Foundation

> **Historical document (CoilSnake-tutorial era, 2026-06).** This repo is now
> Swagbound, a complete EarthBound total-conversion game; see the root README.md.
> Kept as a record; do not follow as current guidance.

## Verified local fixture

REPO_ROOT="."
COILSNAKE_PROJECT="external/coilsnake-project"
COILSNAKE_PATH="CoilSnake-master"

The CoilSnake project was created with:

coilsnake-cli decompile \
  "[local-rom-path-omitted]" \
  "external/coilsnake-project"

Verified fixture:
- Project.snake exists
- ccscript/robot.ccs exists
- robot.ccs contains hello_world:
- robot.ccs contains quoted text
- robot.ccs contains end
- SpriteGroups/005.png exists

Repo state:
This directory may not currently be a Git repo. That is acceptable.
Do not require git initialization.
Do not commit anything.

All relative paths are relative to:

the repository root

## Hard safety constraints

- Do not read, copy, move, modify, compile, generate, or commit the ROM.
- Do not commit extracted CoilSnake assets.
- Treat external/coilsnake-project as local-only fixture input.
- Generated output goes only under apps/game/public/generated.
- Do not rely on the external phaser-4.1.0 directory as source code.
- Install Phaser through the workspace package.json normally unless already present in the repo.
- Do not attempt the full game.
- Do not implement map rendering, sprite animation, battle systems, audio, emulator integration, ROM compilation, or full recreation.

## Objective

Build the first real foundation for an EarthBound-inspired Phaser rebuild by consuming a local CoilSnake project created from the CoilSnake “Your First Hack” tutorial.

The app/converter must only read from a local user-provided CoilSnake project.

Primary input:

external/coilsnake-project

The converter must still emit structured generated output with warnings if the project is missing in another environment.

## Tech assumptions

- TypeScript
- pnpm workspaces
- Vite
- Phaser 4
- Zod
- Vitest
- tsx for TypeScript CLI execution if useful

Use Phaser 4. Fall back to Phaser 3 only if Phaser 4 installation or Vite integration blocks progress, and document the exact blocker in docs/overnight-report.md.

## Required root commands

The repo must support:

pnpm install
pnpm convert
pnpm validate
pnpm test
pnpm dev

## Build structure

- apps/game: Vite + Phaser debug app
- packages/eb-schemas: shared Zod schemas/types
- packages/eb-converter: CoilSnake project importer and validator
- docs: implementation notes and status report

## Generated output contract

Emit exactly these files under apps/game/public/generated:

- manifest.json
- scripts.json
- sprite-groups.json
- validation-report.json

manifest.json is the app entrypoint. It should not embed large imported content. It should reference the other generated files.

manifest.json must include:

- schemaVersion
- generatedAt
- sourceProject:
  - path
  - exists
  - hasProjectSnake
  - detectedFolders
  - tutorialFixtureHints
- files:
  - scripts
  - spriteGroups
  - validationReport
- counts:
  - scriptFiles
  - scriptCommands
  - labels
  - textCommands
  - unknownCommands
  - spriteImages
  - warnings
  - errors
- warnings
- errors

tutorialFixtureHints should detect:

- whether ccscript/robot.ccs exists
- whether a hello_world label exists
- whether any command/text exists under robot.hello_world
- whether SpriteGroups/005.png exists
- whether NPC metadata appears to reference robot.hello_world, if NPC data is parsed or indexed

In the verified local fixture, SpriteGroups/005.png exists and should be detected.
If SpriteGroups/005.png is missing in another environment, report warning/info but do not fail.

## Validation behavior

- Missing external/coilsnake-project: warning, exit 0.
- Missing Project.snake: warning, exit 0.
- Missing ccscript directory: warning, exit 0.
- Missing robot.ccs: warning, exit 0.
- Missing hello_world label: warning, exit 0.
- Missing SpriteGroups directory: warning or info, exit 0.
- Missing generated manifest during validate: error, exit 1.
- Invalid generated JSON schema: error, exit 1.
- Unknown CCScript commands: preserve them, count them, warn only, exit 0.

## Monorepo setup

Create or repair pnpm workspace.

Add root scripts:

- dev
- convert
- validate
- test

Add strict TypeScript config where practical.

Add .gitignore entries for:

- ROM files
- external/coilsnake-project
- generated output
- emulator/save-state files if relevant
- common local tool artifacts
- CoilSnake-master/coilsnake_venv/

## Schemas

Create minimal Zod schemas/types for:

- manifest
- script collection
- script file
- script command
- sprite group/image metadata
- NPC metadata placeholder
- validation report
- validation issue with severity: info | warning | error

## Converter

Implement packages/eb-converter/src/index.ts as a CLI.

It should accept:

- --project, default external/coilsnake-project
- --out, default apps/game/public/generated

It should:

- create the output directory if missing
- detect whether the project path exists
- detect whether Project.snake exists
- detect ccscript/
- detect SpriteGroups/
- parse .ccs files under ccscript/
- index PNG files under SpriteGroups/
- emit manifest.json
- emit scripts.json
- emit sprite-groups.json
- emit validation-report.json
- preserve unknown data instead of throwing whenever possible
- emit structured warnings/errors
- avoid absolute local paths in public generated JSON unless clearly marked debug-only

## CCScript parser v0

Support only a narrow, documented subset:

- one logical command per line
- trim whitespace
- ignore blank lines
- support obvious line comments using //
- support labels like hello_world:
- support full-line quoted text strings
- support inline text followed by a simple command when trivial, because the tutorial uses a compact dialogue line
- support commands: next, end, eob
- preserve unknown tokens as { cmd: "unknown", raw, sourceLocation }
- every command should include cmd, raw, sourceLocation { file, line, column }

The tutorial robot.ccs pattern should parse into:

- a label command for hello_world
- a text command
- an end command

Do not attempt full CCScript support.

## Script output

Use one combined scripts.json.

scripts.json should include:

- schemaVersion
- sourceProjectPath
- files[]
- each file’s relative path
- commands[]
- labels[]
- counts
- warnings

## Sprite import v0

- Detect SpriteGroups/ if present.
- Index PNG files only.
- Do not copy PNGs.
- Do not render imported sprites in Phaser yet.
- Include relative source references and basic metadata:
  - file path
  - inferred id when filename is numeric, e.g. 005.png -> 5
  - extension
  - size if cheaply available without heavy image tooling; otherwise omit
- Specifically detect SpriteGroups/005.png as a tutorial fixture hint in the verified local fixture.
- If missing in another environment, report warning/info but do not fail.

## NPC metadata placeholder

Do not build full NPC parsing unless trivial.

If obvious NPC metadata files exist, index their presence and optionally scan text/YML for robot.hello_world.

Do not fail if unavailable.

Do not implement map rendering.

## Phaser app

Implement Boot/Preload/Debug scene or equivalent.

Debug scene should:

- load /generated/manifest.json
- validate manifest with Zod
- display manifest/source status on screen
- display counts, warnings, and errors
- load scripts.json using the path from manifest
- prefer displaying imported dialogue from robot.hello_world if present
- otherwise display the first imported script text command
- otherwise display a generated fallback status message saying no imported script text was found
- render a primitive retro RPG dialogue box using Phaser graphics and system fonts only
- not use EarthBound assets, logos, sprites, sounds, or exact UI reproductions
- keep game/domain logic separate from Phaser presentation

## Tests

Add Vitest tests for:

- schema validation
- manifest generation with missing project path
- tutorial-style CCScript parsing:
  - hello_world label
  - quoted text
  - end command
- unknown command preservation
- tutorial fixture detection:
  - robot.ccs present
  - hello_world present
  - SpriteGroups/005.png detected if fixture exists

Test fixture constraints:

- Use synthetic CCScript fixtures only.
- Do not use real EarthBound extracted data in tests.
- Do not require an actual CoilSnake project for tests.

## Docs

Create docs/overnight-report.md with:

- what was implemented
- exact commands to run
- how to prepare external/coilsnake-project using the tutorial
- generated file contract
- validation behavior
- assumptions
- known gaps
- next recommended milestone

## Definition of done

- pnpm install works
- pnpm convert emits all four generated files
- pnpm validate produces structured output and correct exit codes
- pnpm test passes
- pnpm dev opens a Phaser debug scene showing generated manifest status
- if the tutorial project exists and includes robot.ccs/hello_world, the scene displays that imported dialogue
- if the tutorial project is missing, the scene still runs and shows clear warnings

## Execution priority

If complexity conflicts arise, prioritize:

1. Safe generated data contract
2. Converter
3. Validation
4. Tests
5. Phaser debug display
6. Documentation

Stop when the definition of done is satisfied.
