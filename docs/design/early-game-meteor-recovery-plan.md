# Early Game Meteor Recovery Plan

Status: implementation-ready direction for the first ten minutes.

This plan supersedes opening-only claims in
`docs/design/canonical-story-architecture.md` when they conflict. In particular,
the opening no longer explains a Bosch derivative or forces a tutorial battle at
the meteor. The larger themes, MiFella arc, Remilia Co. reveal, and late Milady
reveal remain intact.

## Outcome

The first ten minutes should tell one simple story:

1. Something falls on the hill while Bosch is asleep.
2. MiFella wakes Bosch because he wants Bosch to see it.
3. Bosch walks through an unusually empty nighttime Morningside.
4. A small group has gathered around the meteor. One Milady manifestation says
   only `milady`. Nobody explains what that means.
5. Bosch returns home. MiFella is waiting and behaves strangely enough to create
   concern, but the game does not explain the cult yet.
6. Bosch goes back to bed.
7. Morning arrives. The town repopulates, optional activity appears, and Bosch
   receives a clear next objective.

The player may wonder what the meteor and the word `milady` mean. The player must
not wonder where to go next or whether a scene has ended.

## Scope

This wave owns:

- the continuous opening flyover;
- Bosch's house and its immediate exterior;
- the nighttime route from the house to the meteor;
- the meteor gathering;
- the return-home scene and dawn transition;
- the first daytime population state;
- first-town Attestation availability and presentation;
- first-ten-minute humanoid casting, movement, and collision.

It does not rewrite later acts, rebalance ordinary combat, or recast hostile
interiors outside this route.

## Confirmed causes in the current build

| Symptom | Confirmed cause | Authoritative seam |
|---|---|---|
| Flyover text shakes and is too abstract | The caption is attached to the moving camera while recurring camera shake runs. Its copy is hardcoded in TypeScript. | `apps/game/src/openingPacing.ts`, `apps/game/src/chunkedWorldScene.ts` |
| Opening discusses Bosch derivatives | Two dialogue overlays currently culminate in the abstract derivative version, with `narrative-redesign.json` winning load order. | `content/opening-clarity.json`, `content/narrative-redesign.json`, generated loader |
| Vanilla EB people appear in Bosch's house | High-priority per-NPC overrides for house NPCs 14, 15, and 16 point directly to raw generated EB sheets, overriding the broader LSW casting pass. | `content/opening-clarity.json`, sprite override merge order |
| Phone appears to float | The phone is the correct phone sheet at runtime, but it is rendered with a person-like feet anchor instead of a tabletop prop transform. | NPC 21 render/placement path |
| Mailbox blinks or seems to speak without a source | VERIFIED 2026-07-14, and the cause is movement, not casting: nothing gates NPC behavior by type, so the mailbox (NPC 183, `type: "object"`, undecoded `movement: 862`) falls through `heuristicBehaviorForMovement` to bounded WANDER, and a moving single-frame prop blinks via the walk-mirror swap. This is a 59-prop class game-wide (includes two bedroom props at 8136,1088 and 8152,1080). The separate code-native signal mailbox in `content/overworld-interactables.json` carries the opening-era dialogue. | `apps/game/src/npcBehaviors.ts` (`behaviorForNpc` needs an NPC-type gate: non-person types resolve STATIC), `content/overworld-interactables.json` |
| The hill is crowded at night | Night controls tint, but not a durable opening population phase. The opening NPC hold is released as soon as the startup sequence ends. | `apps/game/src/worldNight.ts`, `chunkedWorldScene.ts` |
| Attestations appear during the night | All ten Morningside Source Checks have empty visibility requirements. | `content/drifella-source-checks.json`, `sourceCheckVisible` |
| A battle fires at the meteor | The opening marker unconditionally starts battle group 900001 after its dialogue. | `apps/game/src/newGameOpening.ts`, opening marker data |
| Cutscene actors vanish | The meteor cutscene hides its actor after a short on-screen move rather than waiting for an offscreen destination. | `content/cutscenes.json`, event actor hold/release path |
| Bosch can pass through some people | NPC collision exists, but LSW image scale, feet boxes, initial-overlap escape, and non-NPC story actors do not share one physical footprint. | `chunkedWorldScene.ts`, NPC/story actor collision helpers |
| Drifella battle art can be absent | Attestation queues competing battle and fallback textures, then chooses based on texture readiness during preload. | `BattleScene` Attestation preload path |
| Attestation UI feels noncanonical | Questions use a generic clean grid rather than the same geometry and bitmap-text rules as the canonical battle command windows. | battle menu renderer and clean UI helpers |
| Attestation reward ends too quickly | Victory currently appends a text page and returns through the normal battle result. There is no named Drifella congratulations beat or held Card NFT reveal. | Attestation victory path, Binder card renderer |
| The hill route reveals a cut-off edge | DIAGNOSED 2026-07-14 from data: the camera is bounded to the world (`setBounds(0,0,...)`, chunkedWorldScene.ts:1148), row-0 chunks exist for the hill columns, and sectors rows 0-2 at cols 9-11 are real overworld (`coverArt: 0`). The navy band with sparkles above the cliff is authored EarthBound night-sky backdrop art at the map's north edge, not missing chunks or camera overscroll. Treat as an ART-DIRECTION decision (keep, retile, or add a cliff-top treatment), not a defect fix. One visual confirm at the exact reported spot remains. | map arrangement art at rows 0-1; no engine seam |

## One editable opening source

Create `content/early-game-sequence.json` as the single human-editable source for
this opening. The full-world build will pass it to generated data.

DECIDED 2026-07-14: authority is enforced by an explicit **ownership manifest**,
not by load order. Applying the new file "after the older overlays" would recreate
the exact last-writer-wins pathology that produced the current copy (the loader
already resolves `apply(apply(base, openingClarity), narrativeRedesign)` at
loader.ts:546-566, which is why narrative-redesign silently won). Instead:

- `early-game-sequence.json` declares the dialogue keys, NPC ids, cutscene ids,
  and sprite-override targets it OWNS;
- the loader SUPPRESSES contributions from `opening-clarity.json` and
  `narrative-redesign.json` to owned keys and dev-logs each suppression;
- a build-time validation fails if more than one source claims an opening key;
- a runtime test asserts the RESOLVED first-ten-minutes copy (post-merge, as the
  player sees it) contains zero deny-listed strings: `derivative`, `Remilia`,
  `network`, capitalized `Milady`, and the retired terms from the canon doc.

The older files remain in the repo as historical additive data. This is a named,
narrow amendment to the additive-content invariant (entries stay immutable;
AUTHORITY becomes explicit and exclusive) and must be recorded in AGENTS.md and
CLAUDE.md alongside the rom-truth exception.

The file should contain:

- flyover route, duration, caption, and rumble policy;
- the ordered opening phases and story flags;
- short dialogue blocks keyed by scene, not ROM pointer;
- night and morning cast allowlists;
- actor paths and departure destinations;
- Source Check availability phase;
- the first morning objective.

Draft copy should stay intentionally plain so it is easy to edit:

```text
Flyover: Something fell on the hill above Morningside.
MiFella: Bosch, get up! You gotta see this!
MiFella: Something came down on the hill. Meet me outside.
Meteor manifestation: milady
MiFella: Okay. Okay okay okay. Home. We should be home.
Morning objective: Find MiFella in town.
```

Wayfinding leads, both directions (the mystery contract forbids uncertainty
about the next action):

- uphill: MiFella exits the house ahead of Bosch and is visible on the route,
  waiting at corners; the objective line reads plainly (`Follow MiFella up the
  hill.`);
- downhill: MiFella speaks the going-home line above at the meteor and leads
  back; the return leg must not be dead air. Cheap life: the witnesses disperse
  PAST Bosch on the way down, one hurries by with a single unsettled line, and
  the manifestation is gone when the camera re-crosses the hill.

The 3 to 5 LSW witnesses each need one plain reaction line in this file (lived
effects, not analysis, per the canon NPC rule). Draft:

```text
Witness 1: It just fell. No sound. Things that fall make a sound.
Witness 2: Did anyone else hear it say something?
Witness 3: I want to go home and I am not going home.
```

The home scene needs authored, concrete behavior, not a stage note. Draft beats:
MiFella replays his photos of the crowd; echoes the word once under his breath;
says something warm but off (`Everyone up there felt so together.`); then leaves
by visibly walking out the door per the departure rule. Bosch's bed prompt
follows.

No player-facing opening line should use `derivative`, `Remilia Co.`, network
terminology, or an explanation of Milady. The single lowercase `milady` utterance
is an intentional mystery image, not an identity reveal.

DECIDED 2026-07-14: the utterance stays, as a formal canon amendment rather than
a silent embargo exception:

- exactly one sanctioned occurrence: the lowercase string `milady`, one dialogue
  page, spoken only by the meteor manifestation during the `meteor` phase;
- every embargo grep/lint gate allow-lists that exact string at that exact
  content key and nothing else;
- the Act 3 naming beat is amended to PAY THE WORD OFF: when the recurring force
  is named, the scene must explicitly recall the hill ("the word from the meteor
  was a name"). Ten hours pass between plant and payoff, so the payoff line must
  quote the memory, not assume it;
- lowercase presentation is deliberate: it reads as an address, not a proper
  noun, which preserves the mystery while seeding the reveal.

`docs/design/canonical-story-architecture.md` sections 4 and 7 carry the matching
amendment so the two documents enforce one gate instead of contradicting each
other.

## Opening state machine

Use a pure opening-phase resolver so tint, population, encounters, Source Checks,
objectives, and cutscenes read the same state instead of inferring it from separate
flags.

| Phase | World state | Player action | Exit condition |
|---|---|---|---|
| `flyover` | One stable caption over a continuous arcade-to-house camera move | Watch | Camera reaches Bosch's house and fades |
| `bedroom` | Bosch, household props, and LSW household cast only | Advance MiFella's urgent wake-up | Bosch regains control |
| `night-route` | Night tint; ordinary town NPCs, roamers, encounters, and Source Checks hidden | Walk uphill | Enter meteor gathering trigger |
| `meteor` | Bosch, MiFella, 3 to 5 LSW witnesses, and one Milady manifestation | Inspect the meteor and speak | Short scene finishes; no battle |
| `return-home` | Night route remains sparse | Walk back to Bosch's house | Enter home trigger |
| `home-scene` | MiFella meets Bosch inside; household cast remains LSW | Advance scene; Bosch goes to bed | Bed fade completes |
| `morning` | Day tint; daytime LSW cast, roamers, encounters, and Source Checks enabled | Follow explicit objective into town | Normal Act 1 progression takes over |

Persist explicit flags such as `intro:meteor-seen`, `intro:returned-home`, and
`intro:morning`. Existing opening flags may be read as compatibility aliases for
old saves, but new systems should consume the resolved phase.

Naming caution: the codebase already has `intro:meteor-beat-fired` and
`intro:bedroom-opening-done` (newGameOpening.ts:26-27). Alias them deliberately
in the resolver; do not let old and new spellings coexist by accident.

DECIDED 2026-07-14, old-save policy: **grandfather, never resume**. Any save
whose flags predate this plan (it carries `intro:bedroom-opening-done`,
`signal:cold-signal-seen`, or any act flag, without the new `intro:*` lattice)
resolves to `morning` or beyond. The rewritten opening is never resumed
mid-stream from legacy flags. A save made inside the NEW opening resolves
exactly from its phase flags, and every phase must be re-enterable from a cold
load (kill the tab inside each phase, reload, finish the game).

## Legacy opening machinery disposition

The old opening is not just overlay copy; it is live area-triggered machinery.
Wave 2 owns the disposition of every entry below, and the harness updates land in
the same wave (not after it), or the regression suite goes dark:

| Legacy machinery | Where | Disposition |
|---|---|---|
| `signal-town-cold-signal-open` cutscene: area trigger brackets the OLD outdoor spawn (1980,1712,210x112), delivers retired Dox Sheet/cold-signal copy, and sets `signal:cold-signal-seen`, the root flag of the Act 1 chain | `content/cutscenes.json` | Suppressed by the ownership manifest during opening phases. Its flag is preserved as an alias: the `morning` transition sets `signal:cold-signal-seen` so the Act 1 trigger chain arms unchanged. |
| The meteor marker beat (`INTRO_METEOR_BEAT_FIRED_FLAG`, unconditional battle at chunkedWorldScene.ts:8178) | `apps/game/src/newGameOpening.ts`, `chunkedWorldScene.ts` | Replaced by the `meteor` phase scene. The flag is set by the new scene for compatibility. |
| `scripts/arc-runner.mjs` `drainOpeningCutscene` and `scripts/act1.mjs`, which gate their boot drain on `signal:cold-signal-seen` | harnesses | Taught a phase-aware drain in Wave 2, kept green in the same commit that swaps the story content. |
| Old opening dialogue overlays | `content/opening-clarity.json`, `content/narrative-redesign.json` | Suppressed on owned keys per the ownership manifest; retained as history. |

Census result (2026-07-14), all remaining area-anchored machinery on the route:

| Machinery | Anchor | Disposition |
|---|---|---|
| `onett-welcome-home-lights-out` cutscene | (2592,296), at the house door | Phase-gate: suppressed until `morning`; review copy before re-enabling |
| `onett-minch-brother-nag` cutscene | (2312,280), hill route | Same |
| `onett-brother-fallsin` cutscene | (1944,48), beside the meteor hill | Same |
| `onett-keep-on-task` cutscene | (2680,560), house-to-town route | Same (this is the known hide-without-departure offender) |
| `archivist-photo-01` trigger | (2644,332), front step, no require flags | Phase-gate to `morning` (Archivist is daytime content) |
| 8 Morningside Source Checks inside the route box | various | Covered by the Source Check morning gate |

The census box was the outdoor corridor (1900-3100, 0-1900) plus the bedroom
region; re-run it if the route changes.

## Relocated beats

Removing derivative exposition from the opening must not orphan the beats the
MiFella arc depends on. The photograph, the circulation admission, and the first
derivative sighting are RELOCATED, not cut:

1. **Photograph (night, wordless).** At the meteor gathering, MiFella visibly
   takes a photo (camera flash, phone raise). Bosch is in the frame. No dialogue
   explains it; the flash is the beat.
2. **Circulation admission (morning, arcade).** The morning objective leads to
   MiFella in town; he has already posted the night photo and the arcade crowd
   is buzzing over it. MiFella admits he shared it, excited rather than sorry.
   This is the old beat 2, one scene later, with the same emotional content.
3. **Derivative discovery (Act 1, existing content).** Because the circulated
   image contains Bosch's face, the derivatives that begin appearing in Act 1
   derive from MiFella's post. The arcade clique beat and everything after it
   proceed as already built.

This preserves MiFella's betrayal chain (he circulated an image with Bosch's
face without asking) while letting the night stay wordless and mysterious. It
amends the canon story promise (the inciting photograph is of the meteor
gathering with Bosch in frame, rather than of another Bosch crossing town);
`canonical-story-architecture.md` carries the matching amendment. If Nick
prefers the original inciting image (another Bosch crossing town during the
flyover), that beat must instead be restored to the flyover captions, and this
section revised.

## Phase resolver consumers

The resolver is only a single source of truth if every consumer reads it. The
full list, from code inspection:

- night/day tint (`worldNight.ts`);
- exterior NPC population and roamer spawns;
- INTERIOR population: doors on the night route are LOCKED during night phases
  with one flavor line (decided 2026-07-14; cheapest and most atmospheric), so
  the interior casting system never renders a daytime crowd mid-mystery;
- random encounters and `__forceEncounter`;
- Source Check visibility (`sourceCheckVisible`);
- objectives and the quest journal;
- cutscene/trigger arming (via the ownership manifest);
- MUSIC: night phases select the night cue; the `morning` transition swaps it.
  Currently unlisted anywhere, and per-town music would otherwise blare daytime
  tracks over the empty town;
- the autosave notice ("Autosaved (town reached)"), which must not toast
  mid-mystery;
- the uiScene HUD suppression (today keyed to transient `cinematicActive()`);
- QA: a `__openingPhase()` getter and a DEV phase setter, or every probe
  replays ten real minutes.

## Casting and object rules

### Night cast

The exterior night allowlist should contain only:

- Bosch;
- MiFella;
- 3 to 5 LSW meteor witnesses;
- one Milady manifestation at the meteor.

No ordinary shop crowd, town pedestrian, roamer, random encounter, or Drifella
Source Check appears outside during this phase.

### Morning cast

Every visible humanoid in the first ten minutes of morning must use a canonical
Little Swag World sprite. Movement roles should be authored rather than global:

- pedestrians use bounded wander or short patrols;
- conversational NPCs use look-around or a small idle route;
- clerks remain behind their counters;
- scene actors follow authored paths;
- props never enter humanoid casting.

### Protected categories

- Drifella art may appear only in Source Check overworld actors, Attestation
  battles, reward cards, and the Binder.
- Milady art may appear at the meteor only as the single manifestation, then in
  later hostile or story-authorized roles.
- Phone, mailbox, ATM, doors, signs, furniture, and other props use explicit prop
  transforms and cannot be changed by humanoid group casting.
- Props also may not MOVE: `behaviorForNpc` gains an NPC-type gate so
  `object`/`item` types always resolve to the static behavior instead of falling
  through the movement heuristic to wander (the verified mailbox cause; a
  59-prop class game-wide, including two bedroom props).
- Schema guard in `packages/eb-schemas`: a sprite override targeting an
  `object`/`item` NPC must declare an explicit prop transform and must not carry
  directional walk animations (the current phone override carries `up/right/down`
  animations on a telephone). Make the invalid state unrepresentable, not just
  audited.
- Add a static audit that rejects raw `generated/assets/sprites/*.png` humanoid
  sheets in the protected opening cast and rejects Drifella paths outside Source
  Check systems. Consume the pools from `docs/assets/sprite-canon.md` and the
  vault authority TSVs rather than a new hand-list; mirror the working precedent
  (`scripts/interior-sprite-audit.mjs`). Add one runtime tooth: a DEV-mode
  loaded-texture assertion on the opening route (zero vanilla sheets in the
  first ten minutes).

## Scene choreography and physicality

Cutscene actors must leave causally:

1. Dialogue states where the actor is going.
2. The actor turns and follows a visible path toward a door, street, or offscreen
   destination.
3. The event waits for `actorMove` arrival.
4. The actor is hidden only after leaving the camera or entering the destination.

Bosch and every solid actor should use a shared feet-box model. The repair needs to
cover ordinary NPCs, added NPCs, Source Check actors, and cutscene actors. Initial
placement must avoid overlap rather than relying on the collision escape exception.
Test all four approach directions against at least one actor of each class.

## Flyover and map presentation

- Preserve the one continuous arcade-to-house flyover.
- Put the caption in **uiScene**, not a scroll-fixed object in the world scene.
  The current camera-tracked hack exists because a scroll-fixed overlay "does not
  render reliably over the streamed town chunks at the pulled-back flyover zoom"
  (chunkedWorldScene.ts:7218-7221, the CANVAS-renderer compositing gotcha).
  uiScene is a separate scene with its own camera, already coordinates with the
  flyover via `cinematicActive()`, and demonstrably composites over the world.
  Acceptance: a screenshot burst DURING active rumble shows the caption
  pixel-identical across three consecutive frames.
- Keep the caption inside a fixed safe rectangle at 512x448 and allow manual copy
  edits without changing TypeScript.
- If rumble remains, use sound and a restrained world-camera displacement only.
- Capture the entire house-to-meteor route at 512x448, identify the exact topmost
  exposed chunk or camera extent, and repair that source. Do not mask the defect
  with an interior cover.
- Verify the route in both night and morning phases with no black or void pixels
  exposed by the camera.

## Attestation, after morning only

Attestation should become available only when the opening phase resolves to
`morning`.

### Battle presentation

- Build one deduplicated texture plan before preload.
- Require the authored Drifella battle sprite to finish loading before the battle
  starts; use fallback art only on an explicit load error.
- Render the question and answers in the canonical battle window rectangles, with
  the canonical cursor, spacing, and bitmap-font path.
- Verify all ten Morningside checks in a visual matrix at 512x448.

### Reward sequence

After a successful answer or combat resolution:

1. The named Drifella says: `Congratulations on attesting. Here is your reward.`
2. It names the Card NFT and any item reward.
3. The existing Binder card renderer opens the awarded card at readable scale.
4. The Card NFT stays visible until a fresh Z press.

DECIDED 2026-07-14, hold location and commit semantics: the reveal lives in the
**world scene** and the reward commit is **atomic with battle resolution**.

- Reward AND cleared-flag are committed together in the battle-return restore
  snapshot (extending `applySourceCheckRewardToRestore`, battleScene.ts:2672).
  Splitting them across the Z press would let a quit-during-reveal keep the card
  while leaving the check replayable for a duplicate reward.
- The game returns to the overworld under input lock and immediately opens the
  existing Binder card overlay (`showBinderCardOverlay`,
  chunkedWorldScene.ts:5231). The overlay, and input, release only on a fresh Z.
  The hold is presentation-only; game state is already committed.
- This reuses the shipped Binder renderer instead of porting a card renderer
  into the battle scene. The player-visible behavior is identical to the intent:
  the card stays until Z, and control returns only after that press.

This is a Source Check-specific post-battle phase, not a generic battle victory
rewrite.

## Implementation waves

### Wave 0: lock the baseline

- Add the opening-phase resolver and focused unit tests (dead code: consumed by
  nothing yet), plus the `__openingPhase()` debug hooks.
- Add protected-cast and Drifella-scope audits.
- Add a deterministic first-ten-minute debug route from fresh save.
- Save native screenshots of the current house, hill route, and Attestation for
  before/after comparison.
- Diagnosis status (2026-07-14): mailbox = RESOLVED (movement-heuristic type
  gap, see the causes table); hill edge = RESOLVED as authored night-sky
  backdrop pending one on-route visual confirm; remaining Wave 0 diagnosis is
  only that confirm plus the legacy-machinery audit of `triggers.json` and
  `cutscenes.json`.
- Commit `AGENTS.md` (currently untracked; the orientation doc this plan leans
  on is not in the repo).

### Wave 1: restore presentation and casting

- Add the generated `early-game-sequence` data path.
- Move flyover copy to data and isolate it from camera shake.
- Replace the three raw house humanoid overrides with LSW actors.
- Render the phone as a tabletop prop.
- Protect the house mailbox from character casting and animation.
- Fix the hill edge from its real chunk or camera source.

### Wave 2: ship the night-to-morning story

- Implement the phase-controlled population and encounter gates (all consumers
  in the resolver list, including music, autosave notice, and locked night
  doors).
- Remove the mandatory meteor battle.
- Author the small LSW gathering and one-word Milady manifestation.
- Stage MiFella's meteor and home scenes with real departure paths, plus the
  relocated photograph beat and the morning circulation admission.
- Script Bosch returning to bed, fade to dawn, and the first morning objective.
- Apply the legacy-machinery dispositions (cold-signal suppression + flag
  aliasing) and update the arc-runner/act1 harness drains IN THIS WAVE, in the
  same commit that swaps the story content, so the regression suite never goes
  dark.

### Wave 3: movement and collision

- Give daytime NPCs bounded role-appropriate movement.
- Unify actor feet boxes and collision registration.
- Validate counter containment and actor departures at native resolution.

### Wave 4: Attestation parity

- Gate first-town Source Checks to morning.
- Make Drifella texture loading deterministic.
- Move the question flow onto canonical battle geometry and font rendering.
- Add the congratulations, named rewards, and held Card NFT reveal.

Each wave should be independently bootable and reviewable. Do not combine the
opening recovery and Attestation renderer into one unreviewable release.

## Acceptance gate

A fresh-save, native 512x448 playthrough must prove all of the following:

- the flyover is one continuous arcade-to-house move and its text does not shake;
- all opening copy can be changed in one content file;
- the opening contains no derivative exposition or meteor battle;
- the only exterior night actors are the authored meteor cast;
- the only early utterance of `milady` is the one-word meteor line;
- Bosch's house contains no vanilla EB humanoids;
- the phone rests visibly on the table and the house mailbox is static;
- no autonomous mailbox dialogue fires without a visible speaker or interaction;
- no Source Check or Drifella appears before morning;
- every departing actor visibly walks to a credible exit before disappearing;
- Bosch cannot pass through ordinary, Source Check, or story actors from any side;
- the house-to-meteor route reveals no black band, void, or cut-off map edge;
- morning visibly removes the tint and restores only LSW humanoids to town;
- every Morningside Attestation shows its authored Drifella battle sprite;
- Attestation windows, font, and cursor match the canonical battle menu;
- the named rewards are spoken and the Card NFT remains until Z;
- every scene leaves the player with one plain-language next action;
- all player-facing additions pass the zero-em-dash gate;
- every page of resolved opening copy fits the talk window (measured against
  `ebWindowMetrics`; the current build ships a live overflow, "holding his pho"
  in `output/playwright/meteor-hill-current.png`);
- the resolved-copy deny-list test passes over the runtime-merged dialogue;
- the DEV loaded-texture audit reports zero vanilla EB sheets on the opening
  route;
- the save matrix passes: fresh save through each phase; instant-save plus
  reload inside each phase; a pre-plan save floors to `morning`; a post-game
  save never re-enters the opening; a kill-and-reload inside each cutscene
  completes the game;
- after the collision wave: `scripts/door-return-audit.py` exits 0, clerk
  counter-containment holds, boss-gate contact still fires, and the arc runner
  completes.

Verification should include focused tests, `pnpm build:eb-fullworld`, generated
data consume-path checks, a full unit suite, and native Playwright screenshots from
a real fresh-save sequence. Content changes are not complete until the generated
copy has been rebuilt and verified in the running game.

## Implementation status (2026-07-14)

All waves SHIPPED and verified end to end. Waves 0-3 on main and the new opening
deployed; Wave 4 Attestation parity complete: morning gating, deterministic
Drifella battle sprite, canonical battle-menu geometry with wrapped (non-truncated)
answers, and the reward ceremony (named Drifella congratulations, then the held
Card NFT reveal via the world-scene Binder overlay, held until a fresh Z, reward
and clear committed atomically in the battle restore). The ceremony was briefly
mislabeled "deferred" during QA; that was a test-harness world-detection artifact
(the stale battle overworldHud signal), not a game defect. Verified live: the
congratulations names the Drifella and the card + item, the full-size card renders
at readable scale, holds until Z, and returns control with the check cleared.
