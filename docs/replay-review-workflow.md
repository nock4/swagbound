# Replay Review Workflow

This repo can record the browser-hosted Phaser first-scene review test with
Replay Browser and upload it to Replay.

## Implemented

- Project-local Replay skills are installed under `.agents/skills/`.
- `@replayio/playwright` is installed as a root dev dependency.
- `playwright.config.ts` keeps the existing `review-chromium` project and adds a
  separate `replay-chromium` project.
- Replay upload is enabled only when `REPLAY_API_KEY` is present in the
  environment.
- `pnpm test:replay` runs the existing first-scene Playwright test in Replay
  Chromium.

## Recording Command

Use the 1Password item already stored in `Dev Secrets`:

```sh
REPLAY_API_KEY="$(op item get 'Replay.io workspace API Credentials' --vault 'Dev Secrets' --fields label=credential --reveal)" pnpm test:replay
```

Or save `REPLAY_API_KEY` in ignored `.env.local`; `playwright.config.ts` loads
that file automatically. With `.env.local` present, this exact Replay quickstart
command works:

```sh
npx playwright test --project replay-chromium
```

The first successful setup run uploaded:

```text
https://app.replay.io/recording/8082e720-18f7-41c0-968e-92434bf8221e
```

## MCP Follow-Up

Replay MCP is not attached dynamically to the current Codex session. To inspect
an uploaded Replay recording with MCP, start a new agent session with the Replay
MCP server configured from the Replay quickstart:

```json
{
  "mcpServers": {
    "replay": {
      "type": "http",
      "url": "https://dispatch.replay.io/nut/mcp",
      "headers": {
        "Authorization": "${REPLAY_API_KEY}"
      }
    }
  }
}
```

Once attached, use the Replay MCP tools to inspect the uploaded recording's
timeline, console messages, network requests, source execution, and DOM state.

## Scope

Replay records the browser-based Phaser scene and Playwright review flow. It does
not record Snes9x emulator interaction. Keep emulator proof separate from Replay
browser review evidence.
