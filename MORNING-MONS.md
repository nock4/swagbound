# MORNING-MONS: overnight Mons system build (2026-07-21 -> 07-22)

Branch: `overnight/mons-20260721` (NOT merged, NOT deployed - your call after review).
Plan: docs/mons/mons-system-plan.md. Everything below is committed on the branch,
1318 tests green, and the core loops are verified in real boots with screenshots.

## What got built

**The 777.** Deterministic registry derivation from your Gen 2 manifests: Type -> race
(fusion chart axis), GAN Brilliance -> tier 1-5, Personality -> 21 negotiation banks,
Materials -> element, the 5 [SECRET RARE]s -> special-fusion-only results. 1554 sprites
(~88MB) promoted into the build (wired into build:eb-fullworld). One trait gap in the
source (Minbot has no Type) resolved by documented manual assignment.

**Catching (SMT negotiation).** Weaken a wild mon to half HP and Bosch's CONVINCE
command lights up. The mon asks 3 questions from its personality bank (2/3 right earns
one bonus question; 3/3 joins). Success sends it to the farm; refusal is one attempt
per encounter and the roamer respawns. The wild enemy wears the actual mon's name and
battle-260 art for that encounter only.

**Companion (slot 3).** The active mon fights as a full party member: own turn plate,
BASH / PSI(=its MOVES) / DEFEND, no items, no fleeing. Moves are synthetic PSI entries
compiled from the ability packs, so damage/heal/status/buffs all ride the existing
battle machinery. XP flows back to the roster after each battle; level-ups announce
learned moves.

**The farm (Postwick NE lot, "the lot with no paperwork").** FARMHAND (a kinfolk,
cast from the vault) teaches the loop in stage-aware dialogue; a scripted tier-1
Cheerful (Humgoo) roams the lot and always respawns for the guided first catch.
Press O: roster overlay (companion marker, race/tier/level/bond, pet, release-with-
confirm) and the Fusion Altar flow: pick two -> preview (chart result, projected
level, inheritance toggles) -> FUSE consumes both. Resting mons trickle XP every
~180 steps. Journal quest: "The Lot With No Paperwork" (4 steps).

**Fusion math (SMT-faithful).** chart[raceA][raceB] -> result race; result = lowest
base-level member of that race above the parents' average; tier capped at max parent
+1; same-race = tier-up reroll; the 5 secret recipes (race pair + min tier 4/5)
resolve before the chart. Carry up to 2 moves from the parents' pool.

**Save v2 + migration.** Roster/active/bond persist; v1 saves load untouched with an
empty roster (migration branch + tests - the old hard version gate would have wiped
every existing save).

## Verified in-engine (pixel screenshots in the session)

- Full catch: wild Zlappy -> weaken -> CONVINCE -> 3 questions -> "Zlappy looks Bosch
  over one more time... and hops after him." -> roster entry with caughtAtFlag.
- Companion battle: Zlappy takes its turn, opens Offense, casts Gum Snap: "Zlappy
  tried Gum Snap! Intake Clerk took 28 HP of damage!" and the party wins.
- FARMHAND live teaching dialogue at the lot ("Go say hi. Or fight, then hi. That's
  the order, for whatever reason.").
- Full fusion: Zlappy (Angel) + Humgoo (Zombie) -> Plgush Lv12 Spirit, inherited
  [Small Mend, Kind Word], lineage recorded, both parents consumed.

## Real bugs the live drives caught (all fixed on the branch)

1. Question-draw loop shortened by its own splice (shrinking pool) - unit test added.
2. 35% catch window was luck-dependent under EB bash variance (42hp wild went
   42 -> 17 -> dead around a 14hp gate) - raised to 50%.
3. The round input machine sources command lists independently of the render path,
   so the cursor could never reach CONVINCE - added a per-battle commandsFor
   override used by BOTH.
4. exitBattle cherry-picks fields off the resolved-restore channel and silently
   dropped the capturedMon payload.
5. The usability matrix defaults unknown PSI ids to unusable, filtering all mon
   MOVES to "No learned PSI." - reserved-range exemption.
6. Overlay fusion cursor wrapped modulo the move count, making the FUSE row
   unreachable.
7. The farm anchor collided TWICE with cult-turning NPCs stacked at the exact same
   pixel (Postwick center anchor spots are crowded) - final lot probed clean.

## Adversarial review

Three critics were launched (engine correctness / content+design / player
experience). The content critic finished with a full report; the other two died
mid-run when the account hit its **monthly Anthropic spend limit**, so I ran those
two passes myself directly against the code. No further agent rounds are possible
until the limit resets.

**Content critic (all fixed):**
- BLOCKER: the `samo` secret recipe was mathematically unobtainable (needed two
  tier-5 Zombies; max Zombie tier is 4) -> minTier 4. All 5 recipes now reachable.
- Two sanitized names were amputated ("pərl"->"prl", "Applcrème"->"Applcrme")
  -> transliterated to Perl / Applcreme.
- `fourth-wall-lean` (a per-turn move) softened to `Curtain Lean`; `steady-swing`
  0 PP -> 2 PP (it outdamaged BASH for free); rubber+grave material splashes
  de-duplicated (they silently cost those mons an ability).
- 11 voice-register line swaps + 2 unfair coin-flip question decoys sharpened.

**Engine self-review (all fixed):**
- `commandIndex()` restored the menu cursor via the un-augmented command list, so
  a mon's PSI cursor landed on the wrong slot -> threaded the per-battle resolver.
- A catch only persisted on manual save / new-town autosave (catch at the farm,
  close the tab, mon lost) -> the roster now saves immediately on catch, fuse,
  release, and companion change. Six new runtime-edge unit tests cover release/
  active adjustment, fusing the active parent, catch-survives-wipe, and
  restore-drops-dead-ids.

**UX self-review (fixed the two that mattered):**
- `monEncounterHint` was authored but never shown -> CONVINCE was undiscoverable
  for anyone who skipped the Farmhand. Now surfaced as a one-time battle hint the
  first round the mon is weakened (verified in-engine).
- `handoverScene` (the slot-3 Cloak/Munch beat) was dead -> now fires when the
  roster overlay closes after the first companion is set (verified: "the mon
  steps off the farm grass and stands next to Bosch").
- `townLines` + `momPhone` are authored but still unwired; they need new NPC /
  phone placement plus per-spot pixel verification, so they're listed as
  follow-ups rather than fabricated.

## Second pass (proceed-until-complete)

- Roaming wild mons now appear across Act 2+ (not just the farm): a random catchable
  mon at or below the act's tier ceiling (3 in Act 2, +4 at Act 3, +5 endgame) spawns
  at a vetted walkable cell, capped at one at a time, obeying encounterEnabled.
  Verified: a Cloud Skulljie spawned away from the farm with CONVINCE ready, and
  ?noEncounters correctly suppresses roaming wilds while the farm tutor stays.
- townLines: a Postwick neighbor appears once you have a companion and speaks the
  mon-story town reactions. Verified ("My daughter petted it and it let her. Then
  nobody tried to sell her anything.").
- momPhone: calling Mom with a companion plays the mon-story pages.
- Runtime-edge unit tests (6) added for the fusion/release/restore paths.

## The one true remaining follow-up

- ART: the Fusion Altar prop, training dummy, race icons, MONS FARM sign, and barn
  exterior still need image generation (Codex image_gen / building-regen). The roster
  overlay uses clean text glyphs and the fusion spot is discoverable by dialogue
  meanwhile, so nothing is blocked - it is purely a visual polish pass. It could not
  run tonight because the account hit its monthly Anthropic spend limit (which also
  killed two of the three review agents). Everything else is done.
- The mon overworld follower (walking behind Bosch) stays parked for v2 by design.

## How to play it right now

```
git checkout overnight/mons-20260721 && pnpm dev
http://localhost:4180/?nointro=1&flags=prologue:done,intro:morning,act1:complete,story-item:dox-sheet&noEncounters=1
```
Teleport (T) to Postwick, walk NE to the lot (2872,7112). Or debug-drive:
`__monBattle('supermetalmons-gen2-1-zlappy', 900001)` for an instant catchable battle,
`__monRoster()` / `__monSetActive(0)` / O for the overlay.
