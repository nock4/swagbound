# UX QA Completion Report

## What Changed

- Added richer first-scene runtime QA state exposed through `globalThis.__firstSceneDebug`.
  - Player and NPC marker positions
  - Interaction range and prompt text
  - Dialogue open/page state
  - Movement bounds
  - Rendered status and metadata lines
- Expanded Playwright review coverage from one happy path to three browser playtests:
  - Guided import-status and dialogue interaction route
  - Dialogue advance/close route with movement-lock verification
  - Exploratory movement sweep across boundaries and Arrow/WASD inputs
- Kept the Phaser scene scope unchanged.
  - No map rendering
  - No sprite rendering
  - No audio, battles, emulator integration, ROM compilation, or full-game recreation

## QA Model Used

The QA pass uses the practical pattern common across the reviewed game-testing references:

- Deterministic release-gate route: prove the intended tutorial scene path works every run.
- Directed interaction route: approach the NPC marker, open imported dialogue, advance, close, and reopen safely.
- Exploratory bot-style sweep: drive varied movement input over time and assert the runtime remains bounded and error-free.
- Observable runtime state: verify scene behavior through stable state and console/page-error checks instead of visual guessing.

Reviewed references:

- Razer QA Companion AI: https://www.razer.com/blog/ai-that-plays-to-test-razer-qa-companion-ai-at-gdc-2026/
- modl.ai Bots documentation: https://modl-ai.github.io/documentation/html/keyconcepts_bots
- GameDriver QaaS signal model: https://gamedriver.ai/technology
- TITAN automated video game testing paper: https://arxiv.org/abs/2509.22170
- Towards LLM-Based Automatic Playtest: https://arxiv.org/abs/2507.09490

## Test Coverage

Implemented in `tests/review/first-scene.spec.ts`:

- First scene loads the canvas and generated import status.
- Status panel reports:
  - Project found
  - Script count
  - NPC reference count
  - `SpriteGroups/005.png` metadata detected
  - `robot.hello_world` resolved as script plus NPC reference
- Player can approach the marker and gets a proximity prompt.
- Space/Enter opens imported `@Hello World!` dialogue from generated scripts.
- Dialogue page count is available and stable.
- Movement is blocked while dialogue is open.
- Enter advances/closes the final dialogue page.
- Backspace closes dialogue.
- Exploratory movement keeps the player inside declared bounds.
- Browser console errors and page errors fail the review tests.

## Commands Run

```sh
pnpm install --frozen-lockfile
pnpm convert
pnpm validate
pnpm test:review
pnpm test
pnpm exec tsc --noEmit
rg -n "EarthBound \(USA\)|\.sfc|/Users/" apps/game/public/generated/*.json || true
npx playwright test --project replay-chromium
```

Results:

- `pnpm install --frozen-lockfile`: passed
- `pnpm convert`: passed with one expected structured info warning for `tutorial_npc_744_movement`
- `pnpm validate`: passed with zero validation errors
- `pnpm test`: passed, 21 Vitest tests
- `pnpm exec tsc --noEmit`: passed
- `pnpm test:review`: passed, 3 Playwright review tests
- `npx playwright test --project replay-chromium`: passed, 3 Replay Chromium tests

Replay recordings:

- First scene loads import status and plays imported dialogue: https://app.replay.io/recording/d7cffeba-e436-41f0-98b9-94b7db8080be
- Dialogue advances, closes, and prevents movement while open: https://app.replay.io/recording/1304cfb9-28a1-4e39-a6b6-607331bfdf18
- Exploratory input sweep keeps the player bounded and stable: https://app.replay.io/recording/75966b4b-18ca-4d4f-991d-bfa5992dc6a7

## Safety Checks

- No ROM file was read, copied, moved, modified, compiled, generated, or committed as part of this QA pass.
- No extracted PNGs were copied or rendered.
- Generated public JSON remained under `apps/game/public/generated`.
- Generated public JSON safety scan returned no matches for:
  - `EarthBound (USA)`
  - `.sfc`
  - `/Users/`
- Runtime QA state contains scene positions, counts, prompts, and status text only; it does not expose ROM paths or asset bytes.

## Known Gaps

- This pass verifies the browser-hosted Phaser first scene, not Snes9x emulator interaction.
- The NPC marker remains a safe placeholder marker, not a real rendered imported sprite.
- The map remains a primitive debug room, not imported map rendering.
- The exploratory sweep is deterministic and bounded; it is not a learned agent.
- Replay MCP inspection is still dependent on starting a session with Replay MCP configured.

## Complete Means

For this slice, UX QA complete means `pnpm dev` opens a readable first scene where the player can move, see import status, approach the marker, open imported CoilSnake dialogue, advance or close it, and avoid broken runtime states under both guided and exploratory keyboard input.

## Next Recommended QA Milestone

Add generated coordinate metadata for NPC placements, then update the same Playwright routes to verify marker placement from generated data rather than fixed scene coordinates. Keep rendering primitive until the asset-preview pipeline is explicitly expanded.
