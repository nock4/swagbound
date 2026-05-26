# Video Review Workflow

## Review Command

Run:

```sh
pnpm test:review
```

This command is self-contained:

1. `pnpm convert`
2. `pnpm validate`
3. Playwright opens the Phaser scene in local Chromium
4. Playwright verifies generated tutorial status and imported dialogue playback
5. Playwright writes local review artifacts

## Local Artifacts

Review output is intentionally local and ignored by git:

- `test-results/`
  - test-specific screenshots, traces, and video files
- `playwright-report/`
  - local HTML report

Open the report with:

```sh
pnpm show:review
```

## Sharing Reviews

For GitHub PR review:

1. Run `pnpm test:review`.
2. Open `playwright-report/`.
3. Use the attached video or trace from `test-results/`.
4. Upload the short clip directly to a PR comment.

Keep review artifacts out of commits. The `.gitignore` excludes both
`test-results/` and `playwright-report/`.

## Why This Replaces Replay

Replay.io is no longer required for review evidence. The local setup keeps the
same useful review properties:

- repeatable browser run
- video artifact
- trace artifact
- no paid SaaS dependency
- no uploaded secrets

## Current Review Test

`tests/review/first-scene.spec.ts` verifies:

- the Phaser canvas loads
- generated tutorial status is `16 passed, 0 failed, 0 blocked`
- `robot.hello_world` is selected
- player movement reaches the marker
- interaction opens imported `@Hello World!` dialogue
