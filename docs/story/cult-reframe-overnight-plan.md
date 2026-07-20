# Overnight Plan: Reframe the Whole Game to the Cult Thesis

Goal: take the antagonist from "a machine that copies/corrects people" to **a cult
(Milady) that recruits people, takes their money, and pervades daily life** - across
every town, beat, boss, and enemy name. Thesis + mechanic: see the
`antagonist-cult-thesis` memory. This is a structured, autonomous overnight run
(the `overnight-bughunt` pattern): local branch, never pushes, writes `MORNING.md`.

Two slices are already shipped and prove the pattern: the Morningside turning cluster
(NPCs 910240-910246) and MiFella's museum turn (museum-frank + understanding-lands bloom).

---

## Principles / guardrails

- **Keep what already lands.** The game already treats Milady as a pervasive cult
  ("Everyone north of here works for Milady," the found-speech NPCs, Remilia Co. as its
  corporate face). Extend that; don't fight it.
- **Edit the overlays, not the base.** Reframe text in `narrative-redesign.json`,
  `custom-dialogue.json`, `cutscenes.json`, `boss-battle-dialogue*.json`. Never modify
  base EB entries. Turnings are additive NPCs.
- **Voice = EarthBound delivery + cult vocabulary** (see `dialogue-voice-earthbound`).
  Corpus pull-quotes stay verbatim.
- **Keep the keystones:** the Strawberry prologue callback, the tested 4-act MiFella arc
  shape, boss-gate mechanics, `story-item:dox-sheet` gating.
- **No em dashes.** After each pass, grep the touched files; the gate is zero.
- **Drifella metadata for NAMES only** (turned NPCs are `DRIFELLA 2 #NNNN`); drifella
  SPRITES stay minigame-only; turnings wear `malady-*`/`gns-lsw-*` skins.

## The lexicon (drives the reframe)

Build once, in `docs/story/cult-lexicon.json`, then apply:

| corrections-era | cult |
|---|---|
| correction / corrected | onboarding / onboarded, put on the milady |
| synchronized | in the bit, on-message |
| manifestation | the milady, the mask |
| the machine editing reality | the cult, the floor, the group |
| leaked / copy | recruited, converted |
| provenance / SOURCE-VESSEL-CLAIMANT | KEEP (the machinery's record voice) |
| derivative | KEEP where it reads as crypto-grift; else -> rug / floor |

Cult texture words to seed in: gm, anon, floor, exit liquidity, wagmi/ngmi, the bit,
the traits, rug, onboarding, "put one on."

---

## Phases (each is a Codex fan-out unit; orchestrator reviews every diff)

**P0 - Lexicon + census baseline.** Write the lexicon; snapshot current test
expectations (census 750, the narrativeRedesign embargo) so the run can self-correct them.

**P1 - Vocabulary reframe, per act.** Reframe `narrative-redesign.json`
(storyTriggerDialogueById + cutsceneDialogueById, Acts 1-4), `custom-dialogue.json`,
`cutscenes.json`. One Codex agent per act, lexicon-driven, EarthBound voice. Lift the
corrections-era Milady embargo in `narrativeRedesign.test.ts` as beats convert.

**P2 - Turnings in every town.** For Postwick, Dead Letter, Galleria, Solana Beach,
Vacancy Flats, LSW: add N turned NPCs (drifella name + malady skin + trait found-speech)
at pixel-verified walkable spots. Reuse the `antagonist-cult-thesis` recipe. Batch the
sprite-overrides into one `build:eb-fullworld`; bump the group-59 census once.

**P3 - The counter (Bosch's weapon).** Wire `fx: "understanding-lands"` onto the
recognition beats where Bosch reaches the real person under the milady (museum-frank
done). Ensure the pray-win bosses (cult leaders) fire the bloom. Optionally: a few
corrected NPCs that un-sync for a beat when truly seen.

**P4 - MiFella arc coherence.** Reframe every MiFella beat from "gave them my data /
correction" to "got recruited / put on the milady" (museum done); his guilt engine =
he recruited others, not just leaked. Finale accountability follows.

**P5 - Bosses + enemy names.** Reframe boss taunts (`bossTaunts.ts` /
`boss-battle-dialogue*.json`) and enemy names (enemy 37 etc.) to cult-leader / recruit
voice. Keep record-vocabulary where it's the machinery's paperwork.

**P6 - Verify + regression + report.** `build:eb-fullworld`, reset chunks, full
`pnpm test` (self-correct census + embargo), pixel-verify: opening (turnings render),
museum-frank (bloom on Strawberry), one turned NPC per town. Write `MORNING.md` with
every beat changed, screenshots, and any unresolved conflicts.

---

## Autonomous execution model

`scripts/overnight-cult-reframe.mjs` (mirrors `scripts/overnight-bughunt.mjs`):
own vite on :5199, a local branch, **never pushes**, Codex-billed. Fans out P1/P2/P5
per act/town, applies edits to the overlay JSONs, runs build+tests after each phase,
self-corrects the census + embargo test expectations, pixel-verifies key beats
headless, writes `MORNING.md`. Orchestrator (me) reviews the branch + MORNING.md in the
morning before anything merges or deploys.

## Risks / rollback

- **Scope creep on text.** Bound P1 to the lexicon; don't rewrite plot, only vocabulary
  + framing. Flag any beat that needs real rewriting to MORNING.md instead of guessing.
- **Placement.** Every turning is pixel-verified walkable before commit (the run drops,
  not silently keeps, any spot that fails reachability - and logs it).
- **Tests.** Census + embargo expectations are expected to move; the run bumps them and
  the diff shows exactly by how much.
- **Rollback** = drop the local branch; nothing is pushed or deployed autonomously.
