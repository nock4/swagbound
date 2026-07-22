# Mons system plan: SMT fusion x Pokemon training on Super Metal Mons Gen 2

Status: DESIGN (2026-07-21). Target: overnight autonomous build (Opus 4.8 orchestrating,
Codex subagents executing), reviewed in the morning. Feature unlocks in Act 2; the Mons
Farm lives in Postwick.

## Source research

**Shin Megami Tensei (what we take):**
- *Fusion chart by race.* Every demon has a RACE; fusing two demons looks up the pair
  in a race x race chart to get the result race. The result demon is the member of that
  race whose base level is the lowest one >= the average of the two ingredients' levels
  (+1). Same-race fusion gives a special result. A handful of unique demons only come
  from specific named recipes (special fusion).
- *Skill inheritance.* The fusion result inherits a limited number of skills chosen
  from the two ingredients' pools.
- *Negotiation.* You TALK to a demon mid-battle; its personality type determines how it
  reacts to your answers. Answer in its language and it joins; blow it and it attacks
  or flees. This is exactly Nick's "weaken then convince with questions" - SMT already
  proves the loop.
- *Compendium.* Fused/registered demons can be re-summoned for money. (Our farm roster
  plays this role; no money re-summon in v1.)

**Pokemon (what we take):**
- *XP + level curves, moves learned at levels.* Mons gain XP from battles (and passively
  at the farm, day-care style) and learn abilities at level milestones.
- *Day-care / Amie.* The farm is the day-care + play area: mons left there gain slow XP
  and BOND. Bond gates some abilities and improves convince odds for same-personality
  wild mons.
- *Catch flow.* Weaken first; low HP raises success. We replace the ball with the
  question sequence.

**What we deliberately skip in v1:** breeding, IV/EV grids, held items, type-matchup
matrix beyond the existing PSI-element weakness system, PvP anything.

## The 777 dataset (verified 2026-07-21)

`swagbound-new/asset-lab/curation/good-new-sprites/supermetalmons-gen2-direct-codex-anchor96-0001/`
- 777 mon folders, each: `source.png` (2000px), `battle-260.png` (260px battle sprite,
  alpha-cropped), `overworld-anchor-96.png` (96px overworld sprite), `manifest.json`
  (OpenSea traits). Payload if we ship battle+overworld for all 777: ~63 MB (fine;
  dist prune only strips audio).
- Trait axes -> system mapping:
  - **Type** (10 real races + [SECRET RARE] x5): Drainer 294, Angel 123, Demon 101,
    Mystic 86, Trickster 40, Fielder 35, Spirit 27, Zombie 24, Vampire 22, Ancient 19.
    = the FUSION CHART axis. ~163 mons carry Type 2 (dual-race: eligible for either
    chart row; fusion result honors primary).
  - **GAN Brilliance** (Good 363 / Fine 181 / Superb 147 / Excellent 54 / Perfect 27):
    = TIER (1-5: Fine=1, Good=2, Superb=3, Excellent=4, Perfect=5). Tier sets the base
    level band and fusion rank.
  - **Personality** (22 values; Cute 119, Cheerful 104, Meh 94, Sick 57, Cool 46, Mean,
    Strange, Calm, Shy, Hyper, Wise, Charming, Dope, Lucky, Mischievous, Holy, Noble,
    Kind-hearted, Sweet, Neat, Sleepy): = NEGOTIATION personality. 22 question banks,
    not 777 - authoring stays tractable.
  - **Material / Material 2** (Gum, Clay, Metal, Mana, Gem, Slime, Bone, Ice, Dust,
    Super metal, Ultralight, Super mana, Liquid): = ELEMENTAL AFFINITY mapped onto the
    existing battle element/weakness system + ability-pool flavor.
  - **[SECRET RARE] x5** (samo, mmmmon upgradeee, clown pogger, starcat, bunnigotchi -
    no brilliance/personality traits): NOT catchable, NOT normal fusion results. Each
    is a SPECIAL FUSION with a named recipe (endgame chase content).
  - Trait data needs normalization: trailing-space dupes exist ("Excellent ", 
    "Mischievous ").

## Story integration (cult thesis)

The cult files people; Bosch befriends mons. Convincing a mon is the ANTI-onboarding:
the mon asks the questions, Bosch has to actually listen, and nobody signs anything.
Farm flavor: the one lot in Postwick that Remilia Co. has no paperwork for. Slot-3
seat: the mon companion fills the third hero slot from Act 2 (replacing the planned
lsw-855 frog hero) - your third party member is whoever you befriended, which is the
thesis said with mechanics.

## Mechanics spec

**Registry derivation (deterministic script, no AI):**
`scripts/mons/derive-mons-registry.mjs` reads the 777 manifests and emits
`content/mons/mons-registry.json`:
- id, tokenId, name (sanitized for the dialogue font), race (Type), race2, tier
  (brilliance), personality (+personality2), materials[], element (material->element
  map), spritePaths (battle + overworld), secretRare flag.
- Stats: deterministic from (tier, race, tokenId-hash) - baseLevel = tier band
  (t1:2-8, t2:6-14, t3:12-22, t4:18-30, t5:26-38 - hash picks within band), hp/off/
  def/speed from race archetype curves (Drainer=drain-tank, Angel=support, Demon=
  offense, Mystic=PSI, Trickster=speed/status, Fielder=balanced, Spirit=PSI-frail,
  Zombie=tank-slow, Vampire=drain-fast, Ancient=slow-nuke) scaled by tier, jittered
  by hash. Same input = same registry forever (stable ids, additive-safe).
- Level-up: shared XP curve (EB-style quadratic); stat growth per race archetype.

**Abilities:** `content/mons/mon-abilities.json` - ~60 authored abilities in 10 race
kits + material splashes. Each ability maps onto EXISTING battle machinery (damage,
status from statusEffects.ts, drain, buffs/debuffs, heal) - no new battle-effect
engine work, only data + names in EB voice. Learnsets: each mon learns from its race
kit at level milestones (derived deterministically); fusion can carry 2 inherited
abilities across kits.

**Catching (SMT negotiation, Nick's spec):**
1. Wild mon roamers spawn in Act 2+ sectors (overworld-anchor-96 skins, visible
   touch-to-battle like all encounters; sector lists in content).
2. In battle vs a wild mon, Bosch gains the CONVINCE command (act2+ flag-gated).
   Enabled only when the mon is weakened (HP <= 35%).
3. CONVINCE opens the negotiation: 3 questions from the mon's personality bank
   (22 banks x ~6 questions x 3-4 answers, EB voice; right answers are
   personality-true, not trivia-smart). 3/3 = joins. 2/3 = asks one bonus question.
   <=1 = mon leaves the battle (flees) or takes a free hit, personality-dependent.
4. Success -> mon goes to the farm roster (not straight into the party). Bond starts
   at 0. Higher relative level mons demand a 4th question. 
5. Bond with your active companion of the same personality gives +1 forgiveness.

**Companion (slot 3):** From Act 2, the party's third slot is the ACTIVE MON chosen at
the farm. In battle it acts as a full member (its abilities as its command set,
race/element affinities, its battle-260 art in the status strip). It gains full XP;
farm mons gain trickle XP. Knocked-out mons retreat to the farm (no permadeath).

**Mons Farm (Postwick):** a lot + barn interior:
- Roaming owned mons (up to ~12 visible; overworld sprites), pet/talk interactions
  (bond ticks, personality-flavored one-liners from the negotiation banks).
- FARMHAND NPC: roster management UI (Binder-pattern grid: sprite, name, race, tier,
  level, bond; set active companion; release).
- FUSION ALTAR: pick 2 owned mons -> preview result (race chart + level math +
  inheritable abilities) -> confirm consumes both, result joins roster with lineage
  recorded. Same-race fusion -> tier-up reroll within race. 5 SECRET RARE recipes
  posted as riddles on the barn wall.
- TRAINING DUMMY: pick a farm mon, pay time (steps), targeted XP.

**Fusion math (SMT-faithful):** result race = chart[raceA][raceB] (10x10 authored
chart, race-flavored); result = lowest-baseLevel mon of result race with baseLevel >=
avg(levelA, levelB)+1 that the player hasn't got; tier cap = max ingredient tier +1.
Inherit: player picks up to 2 abilities from the union of parents' known lists.
Deterministic + testable.

**Save state:** monRoster[] (registryId, level, xp, bond, abilities[], lineage?,
caughtAt), activeMonId, farm flags. Additive save fields (old saves = empty roster).

**Asset promotion:** `scripts/mons/promote-mon-assets.mjs` copies battle-260 +
overworld-anchor-96 for all 777 into `apps/game/public/generated/assets/mons/<id>/`
(~63 MB) + emits a sprite manifest keyed by registry id. Lazy-load per mon at
runtime (Phaser dynamic texture load - never preload 777).

## Engine touchpoints (scouted against source 2026-07-21)

**The big reuse win: the Attestation battle machinery is a near-complete convince
flow.** battleScene.ts already runs multiple-choice questions INSIDE battle with a
stage machine (`AttestationBattleState.stage: "question"|"battle"|"complete"`,
battleScene.ts:424; createAttestationState :1054; escalateAttestationToBattle :1444
flips question->battle on wrong answer) and returns a custom payload to the world
scene via `ChunkedWorldRestore.sourceCheck` (battleReturn.ts:83). CONVINCE = the same
machinery with the INVERTED transition (battle->question on command; success=capture)
plus a new `capturedMon` field on ChunkedWorldRestore, consumed idempotently in the
world-scene restore handler (mirror pendingAttestationRewardForReturn,
chunkedWorldScene.ts:6211).

- **Party/roster:** PartyMember type characterModel.ts:28; buildCombatantFromPartyMember
  :77 is the single stats->Combatant funnel (mon plugs in here). Roster = PartyState
  (partyState.ts:322, partyIds + per-char maps). Joins are flag-driven via
  PARTY_RECRUITS (chunkedWorldScene.ts:687) + reconcileRecruits. Battle party =
  battlePartyMembers() :9794. The 4-slot cap lives at battleLogic.ts:449
  (`partyMembers?.slice(0, 4)`), not in the roster (characters cap is 8).
- **Commands:** ALL_BATTLE_COMMANDS battleLogic.ts:50; per-char sets :52-55 +
  commandsForCharId switch :560; menu targeting battleMenuFlow.ts:13. Flee outcome
  enum battleReturn.ts:7; exitBattle battleScene.ts:2833.
- **Roamers:** overworldEnemies.ts (sectorSpawnBudget :108, roamerGroupAllowed :62);
  runtime OverworldEnemyRuntime chunkedWorldScene.ts:443; skins via
  content/overworld-enemy-skins.json byFamily + enemy-name-families expansion; zone
  gating content/roamer-zone-caps.json (Act-1 is whitelist-only; act2+ zones open).
  Wild-mon encounters need a "catchable" tag on the runtime carried into battle init.
- **Farm area:** interiors are MASKED SECTOR-AREAS of the one continuous world, not
  separate maps (activeInteriorRoom :2086, applyInteriorRoomMask :2432). A new
  visitable space = WorldDoor entry + interior geometry entry (onett-interiors.json
  pattern) + added-npcs.json placements. Constraint: needs real walkable ROM-world
  geometry - the farm anchors on an existing Postwick lot/building (driver picks the
  lot from the interior census rather than conjuring a room).
- **Save state:** SaveState saveState.ts:40, SAVE_STATE_SCHEMA_VERSION=1 :13.
  validateSaveState :160 HARD-REJECTS any other version - no migration exists. Mon
  roster = new optional `mons` field + a real migration branch (see blockers).
- **Roster UI:** two patterns - questJournal.ts DOM overlay (lightest) vs
  menuModel.ts Binder grid (BINDER_MENU_ID :386) + uiScene binder card overlay :410
  (controller nav + pause solved). Farm UI uses the Binder pattern (it IS a
  collection grid + detail card).

**The two real blockers (both P2, both bounded):**
1. **4-slot cap + charId-index assumptions.** battleLogic.ts:449 slices to 4; many
   paths assume charId indexes characters.json (commands, sprites, PSI ownership).
   Mitigation: mons get a RESERVED id range (>=100000) producing PartyMember-shaped
   objects; every charId->character lookup gets a mon-registry fallback; slot math
   unchanged (mon occupies one of the 4).
2. **Save version gate wipes old saves on schema change.** Adding `mons` to SaveState
   without migration invalidates every existing save. Mitigation: bump to version 2 +
   add a v1->v2 migration branch (v1 blob = same fields, empty mon roster). This is
   the overnight run's only engine change with blast radius outside the feature -
   gets its own tests (v1 blob loads, roundtrips, roster empty).

## Overnight run plan

Model: proven overnight driver pattern (own vite :5199, local branch
`overnight/mons-YYYYMMDD`, commits per phase, NEVER pushes, build+tests gate every
phase, revert-on-fail, MORNING-MONS.md report). Orchestrator: Opus 4.8. Executors:
Codex subagents (focused GOAL+DONE prompts per workstream, output inspected before
accept).

- **P0 (deterministic, no AI): data + assets.** derive-mons-registry.mjs +
  promote-mon-assets.mjs + zod schema + registry validation test (777 entries, stable
  ids, no trait dupes, all sprite files exist).
- **P1 (Codex, data authoring): the content packs.** race ability kits (~60
  abilities on existing effect machinery), 10x10 fusion chart, 22 personality
  question banks + per-personality encounter/pet lines, FARMHAND dialogue set,
  slot-3 handover scene, town reaction lines, journal texts, 5 secret-rare recipes
  + riddles, display-name override table (the 7 weird names), 50 race x tier
  template enemies. Gate: schema-valid, em-dash zero, banks cover all 22
  personalities, EB-voice spot check.
- **P1b (Codex image_gen + casting, can run parallel): art batch.** Fusion Altar +
  training dummy props, race icons x10 + tier/bond glyphs, FARMHAND cast from gns-*
  vault, barn exterior via building-regen + MONS FARM sign stamp. Gate: pixel review
  in the morning (art is swappable; placeholders don't block engine phases).
- **P2 (Codex, engine): companion + battle.** Mon-as-party-member (slot 3), CONVINCE
  command + negotiation flow in battle (question UI on the battle scene), catch
  result -> roster, wild-mon battle groups. Gate: full suite + new unit tests
  (negotiation state machine, XP/level math).
- **P3 (Codex, world): the farm.** Postwick lot + barn interior, door wiring, roaming
  owned mons, Farmhand roster UI (Binder pattern), Fusion Altar UI + execution,
  training dummy. Gate: suite + real-boot smoke (warp to farm, open roster, fuse two
  seeded mons).
- **P4 (Codex, integration): tutorialization + spawns + polish.** act2+ flag gates,
  the 6-beat teach arc (signpost NPC, FARMHAND intro, guided first catch w/ scripted
  respawning tier-1 mon, slot-3 handover scene, fusion unlock walk, SPY reveal
  extension), CONVINCE first-time battle-log hint, roamer placements in Act 2+
  sectors, pause-menu MONS entry, journal wiring, balance pass on race curves vs
  act2-3 enemies (arc-runner spot check).
- **P5 (verify): overnight QA.** new e2e: catch a seeded wild mon end-to-end (weaken
  -> CONVINCE -> 3 questions -> roster), fuse -> result matches chart math, companion
  fights one battle; pixel screenshots of farm/roster/negotiation into tmp/; 
  MORNING-MONS.md with everything + known gaps.

Morning: I review, we play it, then merge + deploy on your go.

## New assets needed (beyond the 777)

Per the standing art directives: NEW prop/NPC sprites via codex image_gen; buildings
via the GPT Image 2 regeneration pipeline; CAST from the existing gns-* vault first
before generating anything.

| Asset | Source | Notes |
|---|---|---|
| Farm barn exterior | building-regen pipeline | anchors on the chosen Postwick lot; "MONS FARM" sign via sign-names.json stamp |
| Fusion Altar prop | codex image_gen | one 48-96px prop, EB-weird (a pedestal that hums) |
| Training dummy prop | codex image_gen | small |
| Fence/pen props | cast from vault first | likely already exist in EB tileset |
| FARMHAND NPC | cast from gns-* pool | no gen needed; adoption recipe per manifest |
| Race icons x10, tier stars, bond heart | tiny pixel glyphs, codex image_gen batch | used in roster grid + detail card |
| Mon battle portraits | battle-260.png as-is | already made - the 260s ARE the battle art |
| Mon overworld/farm sprites | overworld-anchor-96.png as-is | roamers + farm |
| Catch jingle / farm track | place existing tracks via music manifest | no new audio production |

Name sanitization (audited): 0 duplicate names across 777; only 7 non-plain-ASCII
names need a display-name override table (perl/Applcreme + the 5 secret rares, one of
which contains a literal tab). Longest name 27 chars - grid cells must ellipsize.

## UI surfaces (complete inventory)

1. **Battle: CONVINCE command** - new entry in the command grid (text, like SPY/PRAY).
   Greyed with reason line until conditions met (catchable enemy + HP <= 35% + act2).
2. **Battle: negotiation overlay** - the attestation question UI reskinned: mon's
   battle-260 portrait + question + 2x2 answer grid + progress pips (question 1/2/3).
3. **Battle: mon status strip** - the mon renders in the 4-member party strip
   (name/HP/PP) like any member; its command set is BASH / MOVES (learned abilities,
   PP-costed submenu like PSI) / DEFEND. No GOODS, no RUN on the mon.
4. **Farm: roster UI** (Binder pattern: menu grid + uiScene detail overlay) - grid of
   owned mons (sprite, name, race icon, tier stars, level, bond heart); actions: SET
   COMPANION / TRAIN / RELEASE (confirm). Opened via the FARMHAND (talk) and a
   pause-menu MONS entry once the farm is unlocked.
5. **Farm: fusion UI** - pick slot A + slot B from the same grid -> preview pane
   (result race from chart, projected level/tier, silhouette until confirmed, the 2
   inheritance picks) -> confirm consumes parents. Silhouette = darkened battle-260.
6. **Mon detail card** - binder-card-style overlay: big battle-260, stats, ability
   list w/ PP costs, personality, materials, lineage line ("Fused from A + B").
7. **Pause menu: MONS entry** - menuModel screen (mirror BINDER_MENU_ID) showing
   active companion + shortcut into roster when at the farm; read-only elsewhere.
8. **Journal entries** - the teach-quest objectives ride the existing quest journal.

## Teaching the feature (tutorialization arc)

Principle: teach by doing inside the Postwick arrival questline, one mechanic per
beat, journal-tracked. No tutorial popups.

1. **Signpost (free):** Postwick arrival trigger already points at the Registry; add
   one town NPC + one journal sidequest pointing at "the lot with no paperwork."
2. **Meet the FARMHAND:** intro dialogue names the loop in EB voice ("Wild mons up
   the road. Rough one up till it's winded, then TALK. Actually listen. They can
   tell."). Unlocks farm + MONS menu. Journal: "Catch your first mon."
3. **Guided first catch:** a scripted tier-1 wild mon (fixed spawn near the farm,
   Cheerful personality = the most forgiving bank). CONVINCE surfaces a battle-log
   hint the first time its conditions are met ("It looks winded. Bosch could try to
   CONVINCE it."). Fail-safe: this scripted mon always re-spawns.
4. **Slot-3 handover beat:** setting your first companion plays the small scene
   (party lines from Cloak/Munch), journal advances. From here slot 3 is live.
5. **Fusion unlock:** when roster >= 2, FARMHAND walks you to the altar and runs one
   free preview. Secret-rare riddle board visible but locked until act 3.
6. **Ongoing affordances:** Munch's SPY on a wild mon reveals race/personality/element
   (synergy: SPY is already the scout verb); wrong convince answers give
   personality-flavored feedback that teaches the read ("The Shy mon flinches at the
   loud answer"); the FARMHAND's idle lines rotate tips keyed to roster state.

## New dialogue moments (authoring inventory)

- FARMHAND: intro, per-tutorial-step lines, idle tip rotation, fusion ceremony lines,
  release confirmation (gentle, EB-sad). ~40 lines.
- 22 personality question banks (x6 questions x4 answers + right/wrong feedback
  lines) - the big pack, P1's core. Also reused as farm pet/talk one-liners.
- Wild-mon encounter flavor line per personality ("The wild Vexkin eyes you shyly.")
- Slot-3 handover scene (~8 lines incl. Cloak/Munch reactions).
- Town reaction lines (x4-6 Postwick NPCs): a live companion vs the cult's masks -
  "That one's not a milady. It blinked at me. On purpose." (thesis echo, cheap).
- 5 secret-rare riddles for the barn wall.
- Journal objective texts (~8).
- MOM phone line update (one page: she asks about the mon; warm).

## Battle integration wiring (detail)

- **Wild-mon encounters:** roamer runtime gets `catchableMonId`; battle init carries
  it; the enemy is a RACE x TIER template enemy (50 archetype entries, additive
  battle content) with the specific mon's name + battle-260 injected per-instance via
  the boss-persona-name mechanism (applyBossPersonaName pattern; per-battle, not
  global byEnemyId - avoids the shared-enemy trap).
- **Mon combatant:** PartyMember-shaped object, id >= 100000, stats from
  registry+level; flows through buildCombatantFromPartyMember untouched. charId
  lookups get registry fallbacks (commands/sprite/PSI paths audited by the driver).
- **MOVES:** mon abilities compile to the existing PSI/enemy-action effect machinery
  (damage/status/drain/buff/heal) with PP costs; no new effect engine.
- **CONVINCE resolution:** command -> stage flips to question (attestation machinery
  inverted); success ends battle with outcome "flee"-class + `capturedMon` on
  ChunkedWorldRestore (idempotent world-side consumption -> roster); failure returns
  to battle (mon may act free or flee, personality-dependent).
- **XP:** active mon earns full share in the battle-end summary (level-ups + ability
  learns surface there); farm mons trickle (steps-based tick, day-care style).
- **Elements/status:** materials map to the existing element table; statuses apply
  normally. Party wipe: mon retreats to farm with the party (no permadeath).
- **Texture lifecycle:** battle-260 loaded on encounter start, evicted on exit;
  farm loads <= 12 anchor-96 textures; NEVER preload 777.

## Wider considerations (the "what else")

- **Save migration is the one scary change** (v1->v2 + migration branch + tests) -
  called out in blockers; everything else is additive.
- **Deploy budget:** +63 MB assets, +1554 files -> dist ~7.8k files (Pages cap 20k),
  largest file 260px PNGs (~100KB) - all fine. Build time unchanged (no transform).
- **Balance:** race archetype curves get an arc-runner spot check vs act2-3 enemy
  stats; the autorunner ignores CONVINCE (feature stays optional to the runner), so
  its existing signals stay valid. Telemetry logs catches/fusions for later tuning.
- **Failed catches:** the mon flees the battle; the roamer respawns on sector
  re-entry (no lockout, no missable mons except pacing gates). Duplicate catches
  allowed (fusion fodder).
- **Release is permanent** (confirm dialogue); fusion consumes parents (by design).
- **Progression safety:** the teach-quest is journal-guided but the main story never
  hard-requires a mon; slot 3 simply stays empty if ignored (party of 3, like pre-
  Postwick). No new hard gates on the critical path.
- **Input:** all new UIs ride the Binder/menu patterns = keyboard + controller nav
  already solved. Native 512x448 verification for every new surface.
- **Voice gates:** EB voice, zero em dashes, personality banks are vibe-true not
  trivia (Attestation keeps the trivia lane).
- **Parked for v2 (explicitly out):** mon overworld follower (walks behind Bosch -
  anchor-96 makes it possible; follower calibration is a known open problem),
  breeding, trading, Venue mon tournaments, shiny variants, nicknames, phone-based
  remote roster.

## Open calls (my picks, flag if wrong)

1. Companion REPLACES slot 3 from Act 2 (no lsw-855 frog hero). Slot 4 (lsw-2821)
   unchanged.
2. Catchable = the 772 non-secret mons, but Act 2 spawns draw from tiers 1-3;
   tier 4-5 wilds appear Act 3+ (pacing).
3. Convince questions are personality-flavored vibe checks (SMT), not lore trivia
   (that's the Attestation minigame's lane - keep them distinct).
4. Fusion consumes both parents permanently (SMT rule; makes fusing a real choice).
5. v1 farm capacity: unlimited roster, 12 visible roamers on the lot.
