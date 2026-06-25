# Morning hand-off — battle effects workstream

Overnight run finished the battle-effects workstream. Everything automated is green; the only
things left are the bits that genuinely need you (a human at a browser, and a merge).

## TL;DR
- **PR [#134](https://github.com/nock4/coilsnake-tutorial-experiment/pull/134)** has the whole
  workstream. **802 tests green, tsc clean, `build:eb-fullworld` errors:0.**
- The PSI-effect subsystem now exists and the assist PSI work; every effect kind is implemented;
  66 items + 20 PSI carry faithful (ROM-RE'd) effects.
- Battle-action matrix: **items 72/95 applied, PSI 50/54 applied** — the rest are genuinely
  out-of-scope (permanent stat capsules, novelty items, field-only Teleport).

## What needs you (~15 min)

### 1. Native battle verification — UPDATE: I can drive the browser myself now
Turns out the "can't run a browser" limit was the Codex subagent sandbox, not my Bash here.
I verified the loop end-to-end and confirmed the **Spark Tube (#144) damage item** kills the
boss in the real game (`?battle=448&items=144` → enemy 63hp → 0). I can finish the rest of this
checklist on request the same way — `node scripts/native-probe.mjs --base http://127.0.0.1:5174/
--url-params "battle=<group>&items=<ids>" --press ArrowRight --press z ... --out shot.png`, reading
`__battleDebug` (hp/pp/selection/executionMessage) to assert. So treat this list as optional
spot-checks, not a blocker. Original eyeball checklist (still useful at native 512×448):
- [ ] Cast **Shield**/**PSI Shield** → take an enemy hit → damage roughly halved, narration matches HP lost.
- [ ] Cast **Offense up** → your BASH hits harder next round.
- [ ] Cast **Hypnosis** on the enemy → it falls asleep and skips turns.
- [ ] Cast **Paralysis** → enemy can't move (~3 turns).
- [ ] Cast **Brainshock** → enemy attacks a random side (may hit itself).
- [ ] Cast **PSI Magnet** on the enemy → your PP rises, the enemy's drops.
- [ ] Use a damage item (**Spark Tube** #144 = 120, **Bomb** #147 = 90) → enemy takes it.
- [ ] Use a cure item on a poisoned ally → cured; **Red Tape** (#142) on an enemy → paralyzed.
- [ ] Use a revive item (**Life Signal Horn** #130) on a fainted ally → back to full HP.
- [ ] Menu: picking an assist PSI opens the **enemy** target list for inflicts, **ally** for shield/buff.

### 2. Review the 8 item names I invented (you picked "invent + apply")
On-theme with the existing civic/signal-tech renames; change any you dislike in
`content/item-overrides.json` (or `scripts/author-item-effects.mjs` → re-run):
`95 Ward Pie · 97 District Pie · 98 Static Caramel · 99 Relay Truffle · 142 Red Tape ·
152 Foul Socks · 188 Relief Patch · 189 Ledger Yogurt`

### 3. Merge PR #134.

## Notes / deliberate approximations (all faithful where the ROM gave a clean number)
- **Heals/PP/damage/revive amounts are ROM-exact** (heal = EB arg×6; rockets 120/600/2400,
  bombs 90/270; Horn of life/Lifenoodles = full-HP revive). Evidence in `.codex/rom-output/`.
- **Shields**: EB α/σ halve, β/Ω reflect, 3-hit counter → modeled uniformly as 50% reduction for
  ~3 turns (no reflect mechanic; my shield reduces all damage, not just physical/psychic).
- **Offense up / Defense down**: EB is ±stat/16 per cast (relative); modeled as flat ±8.
- **Status inflicts always land** — EB gates landing on per-enemy *vulnerability %* (no vulnerability
  model yet), so Hypnosis/Paralysis/Brainshock and the immobilize items are 100% + a `remaining:3`
  duration as a balance proxy. This is the main place to revisit for difficulty tuning.
- **"All"-tier PSI** (σ/Ω) hit every target in EB; modeled single-target.
- **PSI Magnet** drains a fixed 5 PP (EB rolls 2-8).
- **Quirk:** a self-cast buff (e.g. Shield) ticks once at the end of the casting turn, so a
  `remaining:3` shield reads `2` immediately after — it's still active for ~3 turns, just counted
  from cast. Consistent rule: statuses tick at the end of the *owner's* turn.

## Deferred (out of scope, not bugs)
- Items still without an effect (matrix "blocked"): permanent stat capsules (101/113-117),
  novelty items (168 Chick / 169 Chicken / 204 Suporma), type-specific weapons (149 Insecticide,
  150/151 Rust promoter, 155/156, 199/200 Snake/Viper), randomized Lucky-sandwich family,
  Kraken soup (109, arg=0), Sudden guts pill (159, EB Guts×2 — buffStat guts exists but unmapped).
- Per-enemy status **vulnerability %** (would make inflicts faithful + balanced).
- Reflect shields and all-target PSI as true AoE.

You can delete this file once you've read it.
