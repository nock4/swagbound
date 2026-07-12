# Session kickoff — continue where we left off (2026-07-12)

Repo: ~/Projects/coilsnake-tutorial-experiment, branch overnight/balance-and-fuels
(12 commits ahead of main, all pushed; main has PR #176+#177 merged). Read
MORNING.md, docs/qa/overnight-plan-2026-07-12.md, and tasks #28/#30/#31/#32
first; memory has the standing directives and gotchas.

Work these in order:

1. **CLIProxyAPI -> gpt-5.6-sol** (installed via brew: /opt/homebrew/bin/cliproxyapi,
   from x.com/thsottiaux post). Run its Codex/ChatGPT OAuth connect (needs my
   browser), define the model route, then canary a small read-only code review on
   gpt-5.6-sol through the proxy. Keep the codex-rescue forwarder (stable 0.144.1,
   default model, reasoning high, never pass model strings) as default until the
   proxy proves out. Guards already in ~/.codex/AGENTS.md.
2. **Arc-runner: dead-letter town entry** — the one wall cascade left (task #31).
   deadletter-arrival needs the real door/tunnel route, not open-field warp-near.
   Also add a per-attempt watchdog (the v7 run hung at objective 31 for 3.5h).
   ALWAYS launch runs WITH scripts/run-health-watchdog.mjs (15-min stale = kill).
3. **Full run v8** -> acts 2-4 fight table (battle-engine fixes dc3616a8 landed,
   table is trustworthy now) -> tmp/balance-worklist.md -> tune
   content/enemy-stat-overrides.json -> confirm re-run.
4. **The Correction engine hook** (Records-view planted-fake swap on
   fuel:correction:record-planted, spec in task #32 history) + build + live-walk
   Correction AND Floor questlines (exit/re-enter for area triggers; cutscene
   dialogue does NOT set dialogueOpen; once-scenes need fresh browser context).
5. **Fuels waves 3-4**: The Onboarding (Solana Beach), then The Unsigned (needs
   the blank-name-boss engine question answered first). Content-only pattern per
   correction-*/floor-* exemplars; 0 em dashes; orchestrator gates everything.
6. **Cutscene wave 2** (15 more located scenes) + the 92 inert stair/escalator
   doors + converter hardening from tmp/code-review-2026-07-12.md.
7. Then: ship prep (#33) — release build, gitignored *-loop.mp3 must ship, public
   playable.

Rules that always apply: goal-prompt discipline (pixels over properties, real-boot
gates), inspect all Codex output before accepting, stage by explicit path (never
git add -A), reset chunk noise after builds, no em dashes in player-facing text,
check long-run health every 15 minutes.
