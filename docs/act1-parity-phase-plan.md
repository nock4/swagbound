# Act 1 Parity: Phase Plan & Cost

Honest plan to go from "engine foundation with move/talk/fight demonstrated" to "EarthBound Act 1
plays like vanilla." Cost is measured in **Codex packages** — one delegated build + an orchestrator
verification gate, the unit this campaign has used (we've shipped ~28 to reach the foundation). Ranges
reflect real uncertainty; the riskiest phases are flagged.

Baseline (done): content-agnostic engine; overworld traversal; text/script engine with flags +
conditionals; one battle with the rolling meter. See design-language-checkpoint.md.

## Critical path (recommended order)

Phase 3 → 4 → 6 are the spine of a playthrough (events, then party/menus, then real battles). 5, 7, 8
layer in. Audio (7) is independent and can run in parallel anytime.

---

### Phase 3 — Scripted-event / cutscene engine  ·  ~4-6 packages  ·  RISK: HIGH
The backbone of every set piece (the intro, every triggered event). Today's event runner does
dialogue + setFlag; Act 1 needs *sequenced* multi-step events.
- Decode EarthBound action scripts / event sequencing from the ROM data (research-heavy, like the
  conditional-branch decode but larger). CoilSnake does not decompile NPC movement/action scripts for
  us; the current runtime only approximates behavior from the numeric `Movement` id.
- Sequenced event runner: ordered steps (move actor, wait, text, set flag, camera move, screen
  effect, start battle, give item).
- NPC/actor movement scripting (paths, timed moves) on the shared movement state machine.
- Screen effects (fade/flash/shake) + camera control.
- e2e + a scripted set-piece demo proving a multi-step sequence runs deterministically.
Why HIGH: the action-script encoding is uncertain until decoded; everything narrative depends on this.

### Phase 4 — Party, stats, and the menu system  ·  ~5-8 packages  ·  RISK: MEDIUM
- Character/party model + generated character/stat data (level, HP/PP, offense/defense/etc.).
- The nested menu system (Status, Goods, PSI, Equip, Check) — a lot of UI surface.
- Menu input/navigation/rendering with EarthBound's window conventions (reuses our window chrome).
Why MEDIUM: well-understood RPG menus, but broad; mostly grind, low unknowns.

### Phase 5 — Items, money, save, phone  ·  ~4-6 packages  ·  RISK: MEDIUM
- Item data extraction + inventory model; item use (field + battle); equipment effects.
- Money / ATM / shops.
- Save system + the Act-1 phone-save flow (persisting flags + party + position).
Note: save also closes a known Phase-2 gap (flags are session-only today).

### Phase 6 — Battle depth + Act-1 bosses  ·  ~6-10 packages  ·  RISK: HIGH
- Party-of-N battle, targeting, speed-based turn order.
- PSI/skills, items in battle, status effects.
- Enemy action scripts (AI) decode; the actual Act-1 bosses (scripted behavior, not just stats).
- Victory flow: EXP, level-up, money, drops; the battle swirl/transition.
Why HIGH: enemy-AI action-script decode is a real research unknown; bosses are scripted; balance is
long-tail.

### Phase 7 — Audio  ·  ~3-5 packages  ·  RISK: MEDIUM-HIGH  ·  (parallelizable)
- SPC music playback (integrate a wasm SPC core) driving the already-extracted music packs.
- SFX hooks (battle, menu, doors, text blips).
Why: SPC emulation integration is self-contained but finicky; we deliberately deferred it.

### Phase 8 — Act-1 content assembly + parity QA  ·  ~4-8 packages  ·  RISK: HIGH
- Canonical new-game start (the bedroom), then the scripted intro beats, Onett set pieces, the first
  Sanctuary, and the map transitions that open as Act 1 progresses.
- Interiors as proper separate maps; door semantics for interior/exterior.
- A full Act-1 playthrough parity pass + a behavioral parity scorecard (counts/state, no prose).
Why HIGH: pure integration, and "99%" is a long tail of tuning against the real sequence.

---

## Totals (honest)

**~26-43 packages across 5 phases (plus parallel audio).** That is *as much work as the foundation
took, probably more*, concentrated in two genuinely uncertain decodes (action scripts in Phase 3,
enemy AI in Phase 6) and a long integration/tuning tail in Phase 8. A realistic read: the foundation
was the de-risking; the remaining work is larger in volume but only HIGH-risk in those specific spots.

## The strategic caveat (matters before spending 30+ packages)

A faithful EarthBound Act 1 build **cannot ship** — it's Nintendo's content end to end. Its value is
(a) a reference/learning target and (b) hardening the engine. The only shippable artifact is the
**engine + original content**. So the real question isn't "can we hit 99%," it's "how much parity do
we need to trust the engine before building the original game?"

By that test, the foundation may already be enough: the three core loops (move/talk/fight) are proven
on real data. Phases 4 (menus/party) and 6 (battle depth) are the systems most worth building *anyway*
for any original RPG — so building them as part of the original game, with original content, gets you a
shippable thing instead of an unshippable replica.

## Recommendation

Two coherent paths:
1. **Parity-first** — run Phases 3→4→6→5→8 (+7) to make Act 1 play like vanilla. ~30+ packages.
   Best if the goal is to fully understand/replicate the game before diverging.
2. **Pivot now** — start the original game on the current engine, and pull in menus/party/battle-depth
   (Phases 4/6) as *original-content* features rather than parity chores. Reuses ~everything; produces
   something shippable; treats the remaining parity systems as build-when-needed.

Given the stated end goal (own twist on the game), path 2 reaches a shippable original product far
faster, and the parity ledger remains the menu for any system you want to study vanilla-first before
building your version.
