# Swagbound audit — findings (2026-07-01)

Base: branch `overnight/eb-parity` @ 67010ad. Produced by an 8-dimension audit workflow (5 dimensions completed; **UX, map, and parity-sweep auditors did not run — monthly Claude spend limit hit mid-workflow**). Findings marked VERIFIED were independently confirmed (adversarial verifier agent, or orchestrator code-read after the verifier fleet died on the spend limit). `unverified` findings come from a single auditor and had solid evidence quality but no independent check.

## P0 — progression/state-integrity bugs

| id | dim | status | class | finding | verdict |
|---|---|---|---|---|---|
| F01 | code-world | ROUGH | fix-candidate | Cancel (X) during the new-game opening permanently strands the startup state machine — EB-script shops/battles become session-wide no-ops | VERIFIED |
| F02 | code-world | ROUGH | fix-candidate | Cancel (X) during one-shot scripted dialogues drops their completion callback — intro meteor battle permanently skippable, story-trigger effects silently dropped | VERIFIED |
| F13 | code-battle-audio | DIVERGES | fix-candidate | Equipment stat bonuses compound permanently across every battle round-trip | VERIFIED |
| F24 | code-pipeline | ROUGH | fix-candidate | Committed generated/ copies drifted from content/ source: stale triggers, music-manifest, dialogue-library, and sprite-overrides missing the entire overworld enemy-skin expansion | CONFIRMED |
| F25 | code-pipeline | ROUGH | fix-candidate | loader.ts loadJson swallows all errors silently — an invalid or missing generated layer (collision-overrides, triggers, cutscenes...) disappears with zero console signal | CONFIRMED |
| F31 | animations | MISSING | fix-candidate | Second party member has no overworld follower sprite — spriteOverrides.follower never authored | VERIFIED |

## P1 — EB battle fidelity (converter drops EB data)

| id | dim | status | class | finding | verdict |
|---|---|---|---|---|---|
| F42 | battle-systems | DIVERGES | fix-candidate | Enemy group formation Amounts dropped — every battle spawns only ONE of each enemy id | VERIFIED |
| F43 | battle-systems | DIVERGES | fix-candidate | Enemy action Direction dropped — ally-directed enemy actions (heals/self-buffs) resolve as attacks ON the party | VERIFIED |
| F44 | battle-systems | ROUGH | fix-candidate | Enemy status ('other') and psi actions are damage stubs — enemies can never inflict any ailment | VERIFIED |

## P2 — medium impact

| id | dim | status | class | finding | verdict |
|---|---|---|---|---|---|
| F03 | code-world | ROUGH | fix-candidate | Overworld Goods 'Use' consumes battle-only items with zero effect and can self-inflict ailments on party members | unverified |
| F04 | code-world | ROUGH | fix-candidate | Streamed chunk textures are never released — unbounded texture-memory growth across a long play session | unverified |
| F05 | code-world | ROUGH | fix-candidate | Authored-content load failures are silently swallowed — a malformed triggers.json or collision-overrides.json disables story gates/roof collision with no signal | unverified |
| F14 | code-battle-audio | ROUGH | fix-candidate | New AudioContext leaked per battle (createBattleSfx per init, never closed) | unverified |
| F15 | code-battle-audio | MISSING | fix-candidate | Enemies never inflict real status ailments or cast real PSI (actionType 3/5 stubbed as plain damage) | VERIFIED — duplicate of F44 |
| F16 | code-battle-audio | ROUGH | fix-candidate | Killing blow's damage/defeat message is cut off after ~1 frame when the last enemy dies | unverified |
| F17 | code-battle-audio | DIVERGES | fix-candidate | Battle RNG is fully deterministic per enemy group — identical fights replay identically | unverified |
| F18 | code-battle-audio | DIVERGES | fix-candidate | Battle-only ailments (asleep/confused/shielded) persist after battle into the overworld and the next fight | unverified |
| F26 | code-pipeline | ROUGH | fix-candidate | Seven content files are copied into generated/ with no build-time schema validation, and runtime validation failure is silent (compounds the previous finding) | unverified |
| F27 | code-pipeline | ROUGH | fix-candidate | Converter foreground-occluder promotion is chunk-local: the bottom tile row of every 16-tile chunk can never see its south neighbor, losing walk-behind occlusion at chunk seams | unverified |
| F32 | animations | ROUGH | fix-candidate | Cutscene-hidden NPCs reappear after any battle or reload: hideActor persistence flags are wrong/missing | unverified |
| F33 | animations | DIVERGES | needs-creative-call | Battle enemies idle-wobble constantly (EB battle sprites are static) | VERIFIED |
| F34 | animations | MISSING | fix-candidate | Encounter swirl ignores battle advantage — no green/red swirl variants | VERIFIED |
| F35 | animations | ROUGH | needs-creative-call | All 399 skinned NPC overrides are single-frame: walk cycles render as a procedural hop and facing changes are invisible | unverified |
| F36 | animations | MISSING | fix-candidate | Ladder/rope/bike hero state art is authored but unreachable in normal play | unverified |
| F37 | animations | MISSING | fix-candidate | Only one follower slot exists — heroes 3 and 4 can never appear in the overworld chain | unverified |
| F45 | battle-systems | MISSING | fix-candidate | Call-for-help enemy actions unimplemented — action arguments carried but never used | unverified |
| F46 | battle-systems | DIVERGES | fix-candidate | Victory EXP is not split among living party members — everyone gets the full total | unverified |
| F47 | battle-systems | DIVERGES | needs-creative-call | Core damage/accuracy formulas are custom approximations, not EB's (off−def/2 vs 2·off−def; custom miss curve; enemies get 5% min SMAAAASH) | unverified |
| F48 | battle-systems | DIVERGES | fix-candidate | PSI PP costs and damage are flat per-strength tables; EB's real per-PSI PP costs sit unread on disk | unverified |
| F49 | battle-systems | DIVERGES | fix-candidate | All offensive/recovery PSI are single-target; EB targeting (all/row) is dropped | unverified |
| F50 | battle-systems | DIVERGES | fix-candidate | Enemy AI is deterministic round-robin over action slots instead of EB's random selection | unverified |
| F51 | battle-systems | ROUGH | fix-candidate | Encounter sector event flag acts as an on/off gate; EB uses it to select between sub-group 1 and 2 | unverified |
| F52 | battle-systems | MISSING | fix-candidate | Overworld roaming enemies never chase the player and never flee when outmatched | unverified |
| F53 | battle-systems | ROUGH | fix-candidate | Single generic 50% shield replaces EB's physical/PSI shield split and reflect variants | unverified |

## P3 — low / creative-call

| id | dim | status | class | finding | verdict |
|---|---|---|---|---|---|
| F06 | code-world | ROUGH | fix-candidate | Command menu and save key are not gated on door transitions — opening the menu mid-fade freezes the transition overlay | unverified |
| F07 | code-world | ROUGH | fix-candidate | Debug publish() builds a large state object every frame in production (including a filter over all ~1600 world NPCs) | unverified |
| F08 | code-world | ROUGH | fix-candidate | Follower sprite only spawns at scene create — a party member joining mid-session is invisible until the next scene restart | unverified |
| F09 | code-world | EXISTS | fix-candidate | worldScene.ts is a 1128-line legacy scene kept only for region-mode builds, yet the live scene imports gameplay constants from it | unverified |
| F10 | code-world | EXISTS | intentional-divergence | Save/load round-trip integrity verified in-engine — position, facing, string+numeric flags, party, vitals, and status ailments all restore | unverified |
| F11 | code-world | EXISTS | intentional-divergence | Test coverage is broad and well-targeted; tsc is clean — remaining untested surface is the two render-layer files | unverified |
| F12 | code-world | ROUGH | fix-candidate | Grouped minor issues: in-place mutation of shared world collision data, unbounded caches, stale startup debug record, authored cost charged without funds check, same-id NPCs ignore each other in collision | unverified |
| F19 | code-battle-audio | ROUGH | fix-candidate | DEFEND bypasses the paralyzed/asleep turn gate and skips the defender's poison tick | unverified |
| F20 | code-battle-audio | ROUGH | fix-candidate | Shield-reduced damage is mis-narrated (and guts lethality mis-computed) on non-physical damage paths | unverified |
| F21 | code-battle-audio | ROUGH | needs-creative-call | Failed run discards every party member's queued command after they were all collected | unverified |
| F22 | code-battle-audio | ROUGH | fix-candidate | Structural trivia: dead helpers in battleScene, stale enemySpeed cast, duplicate parallel test trees | unverified |
| F23 | code-battle-audio | EXISTS | intentional-divergence | Core round flow, mortal-wound odometer, and pure-model test coverage are solid | unverified |
| F28 | code-pipeline | ROUGH | needs-creative-call | Music manifest file paths are never existence-checked at build, and the committed manifest references gitignored audio/jammers files | unverified |
| F29 | code-pipeline | EXISTS | intentional-divergence | Copy-list completeness confirmed: every generated JSON the runtime loader fetches is produced by build:eb-fullworld, and all current content passes schema validation | unverified |
| F30 | code-pipeline | ROUGH | fix-candidate | Dead/legacy tooling and stale-doc grab-bag: superseded stamp-signs, legacy worldScene, hardcoded stale scratchpad path in gen-collision-overrides, unschema'd building-overrides, 'gitignored' doc comments now false | unverified |
| F38 | animations | ROUGH | fix-candidate | Cutscene 'sound' step is a silent no-op | unverified |
| F39 | animations | ROUGH | needs-creative-call | CutsceneRunner cannot express simultaneous actor movement | unverified |
| F40 | animations | ROUGH | fix-candidate | Grouped low-impact animation trivia (dialogue beat pauses, 1-frame visibility flicker path, unskinned roamers, unhashed texture keys, legacy scene) | unverified |
| F41 | animations | EXISTS | intentional-divergence | Confirmed working (notable): hero walk cycles, NPC face-on-talk state, battle hit FX pipeline, two-phase rounds, victory tally, cutscene movement decode, typewriter | unverified |
| F54 | battle-systems | ROUGH | needs-creative-call | Status ailment roster is a 5-entry subset and sleep/confusion persist onto the field after battle | unverified |
| F55 | battle-systems | DIVERGES | fix-candidate | Enemies ignore PP — PSI-using enemies cast forever | unverified |
| F56 | battle-systems | EXISTS | fix-candidate | Residual item-effect gap is now only 6 consumables, none Act-1-reachable (the '53 consumables' gap is closed) | unverified |
| F57 | battle-systems | EXISTS | intentional-divergence | Two-phase round pipeline, run/guard priority, advantage swirls, instant win, unescapable Act-1 bosses, rewards and level-ups all verified working | unverified |

---

# Full findings detail

## Dimension: code-world

**Coverage:** Read in full: chunkedWorldScene.ts (all 6201 lines), saveState.ts, partyState.ts, state.ts, eventHost.ts, eventRunner.ts, playerController.ts, npcController.ts, npcBehaviors.ts, doorTriggers.ts, storyTriggers.ts, gameFlags.ts, inputModel.ts, seededRng.ts, chunkStreaming.ts, loader.ts, main.ts, uiScene.ts, overworldInteractables.ts, overworldStatusHud.ts, mapTransition.ts, transitions.ts, cutsceneRunner.ts, cutsceneActorMovement.ts, scriptedDialogueResolver.ts, customDialogueLookup.ts, drifellaBarks.ts, collisionFootprint.ts, collisionOverlay.ts, renderDepth.ts, windowSettings.ts, playerVisualState.ts; menuModel.ts partially (~500 of 1534 lines: action parsing + Goods/Equip/PSI view models). Ran `npx tsc --noEmit -p apps/game/tsconfig.json` (clean). Inventoried all 82 test files. Ran 3 headless-browser probes against the live dev server (:5173): X-cancel during new-game opening (bug confirmed), Z-advance control run, and a full save/load round-trip (passed). NOT examined in depth: menuModel screen-stack navigation internals, windowFrame.ts/windowLayout.ts, roomBounds.ts, dialogueRenderer.ts, bitmapFont.ts, introScene.ts, newGameOpening.ts internals (covered by their own tests), fallbackScene.ts, musicAuditioner.ts (dev-only), audio/ modules, worldScene.ts internals (legacy scene, dead-code assessment only), and all battle-side modules (another auditor's dimension). Did not run pnpm test (forbidden). Multi-hour-session memory-growth claims (chunk textures, caches) are static analysis only, not measured at runtime.

### F01 · Cancel (X) during the new-game opening permanently strands the startup state machine — EB-script shops/battles become session-wide no-ops

- **status:** ROUGH · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED (orchestrator code-read + auditor in-engine probe)
- **files:** `apps/game/src/chunkedWorldScene.ts:5296`, `apps/game/src/eventHost.ts:699`, `apps/game/src/chunkedWorldScene.ts:4150`, `apps/game/src/chunkedWorldScene.ts:4375`, `apps/game/src/chunkedWorldScene.ts:4382`
- **evidence:** closeDialogue() (X key) calls eventSequence.abort(); RuntimeEventSequence.abort() (eventHost.ts:711) sets this.onComplete = undefined WITHOUT invoking it, so finalizeNewGameStartup never runs and startupRunActive/startupMode:'opening' stay set forever. Verified in-engine: headless probe pressed X during the fresh-game opening dialogue → __firstSceneDebug.newGameStartup.status stuck at 'running', eventExecutor.result.status 'aborted', flags [] (INTRO_BEDROOM_OPENING_DONE_FLAG never set), player controllable. Consequences by code: startEventBattleForCurrentMode() and openShopForCurrentMode() return false while startupRunActive (EB CCS shop clerks reach Buy/Sell via the event host, per the shop-clerk pipeline), and isEventEffectSupportedForCurrentMode() whitelists only text/pause/flags/warp/actorMove while startupMode==='opening', so every subsequent EB script interaction (give/money/shop/battle/music) is silently skipped for the whole session. Control probe (Z through the dialogue) finalizes correctly: status 'completed'. Recoverable only by reload or any battle-return scene restart — invisible to the player.
- **EB parity note:** EarthBound never lets the B/cancel button dismiss scripted dialogue mid-scene, so this failure mode does not exist on SNES. High confidence in that EB claim.
- **recommendation:** Make RuntimeEventSequence.abort() invoke onComplete with the aborted result (finalizeNewGameStartup already handles status==='aborted'), or make closeDialogue a no-op while startupRunActive/authoredOpeningCutsceneRunActive. Also consider disallowing X-dismissal of event-sequence dialogue entirely (EB parity).

### F02 · Cancel (X) during one-shot scripted dialogues drops their completion callback — intro meteor battle permanently skippable, story-trigger effects silently dropped

- **status:** ROUGH · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED (orchestrator code-read)
- **files:** `apps/game/src/chunkedWorldScene.ts:5300`, `apps/game/src/chunkedWorldScene.ts:4188`, `apps/game/src/chunkedWorldScene.ts:4250`, `apps/game/src/chunkedWorldScene.ts:4542`
- **evidence:** closeDialogue() sets pendingScriptedDialogueComplete = undefined before closing (line 5300), so the onComplete passed to startOverriddenScriptedDialogue never fires on X-cancel. Three call sites: (1) maybeStartIntroMeteorBeat sets INTRO_METEOR_BEAT_FIRED_FLAG BEFORE the dialogue (line 4188), so X during that dialogue skips completeIntroMeteorDialogue → the scripted intro battle never happens and can never re-fire (flag persists into saves); (2) maybeFireStoryTrigger (line 4250) — trigger setFlags/warp/battle skipped (re-armable on area re-entry, so recoverable); (3) triggerBossGate (line 4542) — boss battle skipped (re-arms by distance, recoverable). Same key also aborts NPC event sequences mid-run (effects half-applied). Static analysis; the identical mechanism was probe-confirmed for finding 1.
- **EB parity note:** In EarthBound, dialogue advances with A and cannot be cancelled out of; one-shot scripted beats are uncancellable. The X:close affordance itself is a divergence with real state loss attached. High confidence.
- **recommendation:** On cancel, run (not drop) pendingScriptedDialogueComplete — treat X as 'skip to end' rather than 'abandon' — or make dialogues launched by story beats/gates non-cancellable. At minimum move the INTRO_METEOR_BEAT_FIRED_FLAG set into completeIntroMeteorDialogue.

### F03 · Overworld Goods 'Use' consumes battle-only items with zero effect and can self-inflict ailments on party members

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/menuModel.ts:734`, `apps/game/src/partyState.ts:1131`, `apps/game/src/partyState.ts:1157`, `apps/game/src/partyState.ts:401`, `apps/game/src/chunkedWorldScene.ts:2841`
- **evidence:** buildGoodsActionScreens offers 'Use' (enabled: true) for every consumable inventory entry with party members as targets. PartyState.useItem consumes the item whenever decodeItemUseEffect returns an effect, but applyUseEffectToVitals (partyState.ts:1131-1139) is an explicit no-op for damage/drainPp/buffStat/permStat/revive kinds — so field-using e.g. a bomb ('damage' effect) burns the item, reports 'Used.', and does nothing. Worse, applyUseEffectToStatuses (1157-1168) DOES apply inflictStatus to the chosen PARTY target, so an offensive inflict item used from the field poisons/paralyzes your own hero. Static analysis of the exact code path (handleItemUseAction → useItem → applyEffectToChar).
- **EB parity note:** EarthBound field item use answers 'You can't use that here.' for battle-only items and does NOT consume them; offensive items can never target party members from the field menu. High confidence.
- **recommendation:** Gate the field-use path on itemEffectTargetSide(effect) === 'party' (helper already exists at partyState.ts:115) plus a field-usable effect-kind whitelist; return ok:false ('You can't use that here.') without consuming otherwise.

### F04 · Streamed chunk textures are never released — unbounded texture-memory growth across a long play session

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:1129`, `apps/game/src/chunkedWorldScene.ts:1177`
- **evidence:** requestLayer() loads a texture per chunk layer keyed chunk-<layer>-<cx>-<cy> and skips reload when textures.exists(key); unloadChunksOutsideRetain() destroys only the Image game objects, and no code path calls this.textures.remove for chunk keys (grep confirms zero texture removals in the scene). The full-world map is ~1000 chunk PNGs per layer; traversing the map accumulates every visited chunk texture in the TextureManager for the life of the game instance (also surviving scene restarts). Static analysis; not measured at runtime.
- **EB parity note:** No EB-behavior equivalent — pure engine resource management. N/A.
- **recommendation:** In unloadChunksOutsideRetain, also this.textures.remove(chunkTextureKey(...)) for evicted chunks (keep the retain ring as the cache), or add an LRU cap on resident chunk textures.

### F05 · Authored-content load failures are silently swallowed — a malformed triggers.json or collision-overrides.json disables story gates/roof collision with no signal

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/loader.ts:153`
- **evidence:** loadJson() wraps fetch+schema.parse in a bare try/catch returning undefined with no logging. Every authored layer (triggers.json, cutscenes.json, collision-overrides.json, custom-dialogue.json, overworld-interactables.json, music-manifest.json, ...) loads through it, and all consumers treat undefined as 'feature absent' (e.g. applyCollisionOverrides returns early → roofs walkable again; storyTriggers undefined → no gates/barriers). A single Zod validation error after a content edit silently reverts major systems, which is exactly the class of regression this branch's collision-overrides work is meant to prevent.
- **EB parity note:** N/A — build/content pipeline robustness, not EB behavior.
- **recommendation:** Log a console.error with URL + Zod issue summary on parse/fetch failure (and consider surfacing count of failed content files in the debug panel / __firstSceneDebug.resolveStatus).

### F06 · Command menu and save key are not gated on door transitions — opening the menu mid-fade freezes the transition overlay

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:2630`, `apps/game/src/chunkedWorldScene.ts:3274`, `apps/game/src/chunkedWorldScene.ts:871`
- **evidence:** openCommandMenu() guards on menu/dialogue/eventSequence/cutsceneRunner but not isDoorFadeActive() or pendingBattleStart; handleSaveKey() likewise. update() checks menuState.open (line 871) and returns BEFORE updateDoorTransition (line 883), so pressing M during a door fade opens the menu and stalls the fade at its current alpha (screen stuck dark) until the menu closes; P mid-fade saves during the transition. The encounter-swirl case is harmless (tickEncounterSwirl returns before the menu branch). Static analysis of update-loop ordering.
- **EB parity note:** EB ignores menu input during door transitions. High confidence.
- **recommendation:** Add !this.isDoorFadeActive() && !this.pendingBattleStart to openCommandMenu and handleSaveKey guards.

### F07 · Debug publish() builds a large state object every frame in production (including a filter over all ~1600 world NPCs)

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** medium
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:5824`, `apps/game/src/chunkedWorldScene.ts:5927`, `apps/game/src/uiScene.ts:264`
- **evidence:** publish() runs at least once per update() and rebuilds the full FirstSceneDebug object: world.npcs.filter(isNpcVisible) over the entire world NPC array (line 5927), statusLines()/metadataLines(), debugInteractables() over all interactables, interactionTarget() recomputed 3+ times per frame (publish + updatePrompt + nearestInteractionTargetDebug each rebuild the candidate array), and overworldStatusHud() rebuilt 3x/frame (publish, updateDangerHeartbeat, HUD). uiScene.update() additionally JSON.stringifies menu screens + HUD view + text runs every frame for its dirty-check signature. Not DEV-gated. Functionally correct; measurable CPU waste on low-end machines.
- **EB parity note:** N/A — engine overhead, not EB behavior.
- **recommendation:** Gate the heavy debug fields (npcs list, visibleNpcCount, interactables, statusLines) behind import.meta.env.DEV or a throttle (e.g. publish full state at 5Hz, cheap fields per-frame); cache interaction candidates per frame.

### F08 · Follower sprite only spawns at scene create — a party member joining mid-session is invisible until the next scene restart

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:5606`, `apps/game/src/eventHost.ts:346`
- **evidence:** spawnFollower() runs once in create() and returns early when partyState.party().length < 2; RuntimeEventHost.party('add', char) (EB script party-join effect) mutates partyIds mid-play but nothing re-invokes spawnFollower, so the new member has no overworld body until a battle-return/scene restart. Currently masked because ensureIntroParty() makes the Act-1 duo at create, but any script-driven join (Jeff/Poo in the 4-hero roster) will hit it. Static analysis.
- **EB parity note:** In EarthBound the follower appears the moment a member joins (mid-cutscene). High confidence.
- **recommendation:** Call a spawnFollower-if-needed check whenever partyState.party() grows (e.g. after event sequences complete, or hook partyOp via a scene callback).

### F09 · worldScene.ts is a 1128-line legacy scene kept only for region-mode builds, yet the live scene imports gameplay constants from it

- **status:** EXISTS · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/worldScene.ts:1`, `apps/game/src/chunkedWorldScene.ts:113`, `apps/game/src/main.ts:132`
- **evidence:** main.ts still registers WorldScene and routes to it only when world.json is legacy region-mode with images (main.ts:132-140) — unreachable in the full-world build. chunkedWorldScene.ts:113 imports PLAYER_SPEED and INTERACTION_DISTANCE from './worldScene', coupling the live scene to the dead one (deleting the legacy scene breaks the live one). uiScene also types its world handle as WorldScene.
- **EB parity note:** N/A — code hygiene.
- **recommendation:** Move PLAYER_SPEED / INTERACTION_DISTANCE (and the shared scene interface uiScene needs) into a small shared module; then worldScene can be deleted or quarantined without touching the live scene.

### F10 · Save/load round-trip integrity verified in-engine — position, facing, string+numeric flags, party, vitals, and status ailments all restore

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/saveState.ts:80`, `apps/game/src/partyState.ts:707`, `apps/game/src/chunkedWorldScene.ts:3281`
- **evidence:** Headless probe: walked to (7833.8, 600), set flag audit:probe-flag, inflicted 'poisoned' on charId 0, pressed P, reloaded without URL params → restoredFromSave:true, exact position restored, flag present, poisoned status present, HP/PP 75/75+25/25 intact, partyCount 2. saveState.ts validates every field defensively (schema version, finite numbers, unique ids) and PartyStateSnapshot covers wallet/bank/partyIds/inventory/equipped/storage/statuses/vitals/battleMembers (level+exp included). Notable gaps (all cosmetic): encounter RNG seed, lastEncounterGroup, and a story-trigger-forced music cue are not persisted; savedAt only. Boss defeats (trigger:<id>), opened presents, cutscene-done flags all live in string flags and are captured.
- **EB parity note:** Matches EB save semantics (position + progression + party state). The forced-music-cue omission means a trigger-set track reverts to sector music after load — EB persists area music implicitly via location. Medium confidence on that nuance mattering.
- **recommendation:** No action needed; optionally persist forcedOverworldMusicCue and lastEncounterGroup for polish.

### F11 · Test coverage is broad and well-targeted; tsc is clean — remaining untested surface is the two render-layer files

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/test/saveState.test.ts`, `apps/game/test/menuModel.test.ts`, `apps/game/test/doorTriggers.test.ts`, `apps/game/src/uiScene.ts:1`
- **evidence:** npx tsc --noEmit -p apps/game/tsconfig.json passes. 82 test files across src/*.test.ts and test/: every pure-logic module in this dimension's scope has a dedicated test (saveState, doorTriggers, storyTriggers, menuModel, playerController, npcController, roomBounds, mapTransition, chunkStreaming, collisionFootprint/Overlay, inputModel, seededRng, gameFlags, windowLayout/Frame/Settings, dialogueRenderer, overworldInteractables, rollingMeter, renderDepth) plus qa-* scenario suites (qa-save, qa-menus, qa-shops...). Untested: uiScene.ts (738 lines, pure rendering) and the ChunkedWorldScene orchestration itself (only chunkedWorldSceneInterior.test covers a slice) — which is exactly where findings 1/2/6 live: the scene's input/lifecycle glue is the one layer tests don't reach.
- **EB parity note:** N/A.
- **recommendation:** Consider a headless-Playwright smoke test for the cancel-key paths (finding 1/2) since unit tests structurally can't catch scene-glue regressions; otherwise coverage is in good shape.

### F12 · Grouped minor issues: in-place mutation of shared world collision data, unbounded caches, stale startup debug record, authored cost charged without funds check, same-id NPCs ignore each other in collision

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:1533`, `apps/game/src/chunkedWorldScene.ts:1713`, `apps/game/src/eventRunner.ts:82`, `apps/game/src/chunkedWorldScene.ts:1737`, `apps/game/src/chunkedWorldScene.ts:494`
- **evidence:** (a) applyCollisionOverrides mutates this.solidRows rows in place, and solidRows IS world.collision.solidRows (assigned by reference at create:718) — the shared GameData is permanently patched; harmless today only because the patch is idempotent ('1's stay '1's). (b) serviceInteractionCache keys embed the full numeric-flag list + JSON of events, so every flag change mints new keys for every service NPC — unbounded Map growth over a session; warnedInvalidDoorWarps similar but tiny. (c) After the finding-1 cancel, newGameStartupRecord reports finalPlayerControllable:false while the player is demonstrably controllable (probe output) — stale debug telemetry. (d) eventRunner.ts:82: an authored interaction with cost but no service emits money:take with no wallet check — applyMoney clamps at 0, so a broke player still receives the goods after paying whatever they have. (e) blocked() ignoreNpcId matches by npcId, so duplicate placements of the same EB NPC id pass through each other.
- **EB parity note:** (d) EB always checks funds before paid services. Others are engine hygiene, N/A.
- **recommendation:** Copy solidRows before patching; key the service cache by npcId + relevant-flag subset or clear it on flag change; update the startup record after cancel; add a wallet>=cost guard to the authored cost path; key collision ignore by runtime key instead of npcId.

## Dimension: code-battle-audio

**Coverage:** Examined in full: battleRound.ts, battleLogic.ts (both pages), statusEffects.ts, rollingMeter.ts, battleEvents.ts, battleMessages.ts, battleSfxPlan.ts, battleAutoPolicy.ts, battleMenuFlow.ts, battleReturn.ts, battleMusic.ts, encounterLogic.ts, characterModel.ts, battleEffects.ts, battleScene.ts (all 3.9k lines), audio/battleSfx.ts, audio/music.ts, audio/transitionSfx.ts, sharedMusic.ts, worldMusic.ts, plus the battle wiring in chunkedWorldScene.ts (startBattleWithReturn/battlePartyMembers/equipStatBonuses) and the partyState.ts writeback/restore path. Verified: npx tsc --noEmit clean; equip-bonus compounding reproduced with a one-off tsx script driving the real PartyState + characterModel code; 3 native-probe runs against a live battle (group 3, party=1) confirming flow, execution messaging, and deterministic RNG. NOT examined: battleBackground.ts/battleVisuals.ts/backgroundOverrides.ts internals beyond skim (they have dedicated tests), bitmapFont.ts internals (used by introScene only), musicAuditioner.ts (dev-only, DEV-gated), cleanUi/windowLayout layout math, shop/menu flows, worldScene.ts (legacy), and the chunkedWorldScene post-battle restore consumers beyond partyState.restore. Did not run pnpm test (forbidden). The final-kill message-skip finding is code-confirmed but the exact kill frame was not captured in-engine (deterministic guts-save/dodge rolls made scripting the killing blow expensive within the probe budget).

### F13 · Equipment stat bonuses compound permanently across every battle round-trip

- **status:** DIVERGES · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED (orchestrator code-read + auditor tsx repro: offense 30→40→50→60)
- **files:** `apps/game/src/chunkedWorldScene.ts:5001`, `apps/game/src/battleScene.ts:3496`, `apps/game/src/battleScene.ts:3448`, `apps/game/src/partyState.ts:672`
- **evidence:** chunkedWorldScene.battlePartyMembers() folds equip offense/defense INTO member.stats before each battle (5001-5006). battleScene.buildPostBattlePartySnapshot → battleMemberSnapshotFromCombatant stores combatant.stats verbatim (equips included) into the post-battle snapshot; partyState.applyToPartyMembers then uses battleMember.stats as the member's base stats for the NEXT battle, where equip bonuses are added AGAIN. Reproduced with a tsx script using the real PartyState + characterModel code and a +10 weapon: combatant offense = 30, 40, 50, 60 over four battle round-trips. The inflated stats are also what gets save-persisted.
- **EB parity note:** In EarthBound equipment is a modifier on top of base stats and is never baked into them; stats only grow via level-ups and capsules. High confidence.
- **recommendation:** Persist BASE stats in the post-battle snapshot: either subtract equipStatBonuses before writing battleMembers stats, or (cleaner) keep equip bonuses out of member.stats entirely and pass them as PlayerCombatantOptions.statBonuses per party slot (the plumbing already exists in buildPlayerCombatant/buildCombatantFromPartyMember). Add a regression test: two battle round-trips must leave base offense unchanged.

### F14 · New AudioContext leaked per battle (createBattleSfx per init, never closed)

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleScene.ts:567`, `apps/game/src/chunkedWorldScene.ts:4864`, `apps/game/src/audio/battleSfx.ts:251`
- **evidence:** BattleScene.init does `this.battleSfx_ = data.battleSfx ?? createBattleSfx()` and chunkedWorldScene.startBattleWithReturn passes no battleSfx in the swirl params (4864-4880), so every battle constructs a fresh WebAudioBattleSfx. Each lazily creates its own AudioContext + masterGain connected to destination; no `.close()` exists anywhere in apps/game/src/audio (rg for close() → no matches). The previous instance is dropped unreferenced with its context still running. Music correctly uses getSharedMusic; SFX does not.
- **EB parity note:** N/A (engine hygiene, not an EB behavior). The custom Web Audio SFX layer itself is the approved original-audio direction.
- **recommendation:** Share one BattleSfx the way music is shared (registry-backed getSharedBattleSfx), or pass the world scene's menuSfx instance through the battle-start params, or call context.close() on replacement.

### F15 · Enemies never inflict real status ailments or cast real PSI (actionType 3/5 stubbed as plain damage)

- **status:** MISSING · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED — duplicate of F44 (same converter/battleLogic gap found independently by two dimensions)
- **files:** `apps/game/src/battleLogic.ts:1618`, `apps/game/src/battleLogic.ts:1636`, `apps/game/src/battleLogic.ts:954`
- **evidence:** enemyActionEffectKind maps actionType 3 → 'psi' (resolved as 0.85x generic physical-derived damage) and 5 → 'statusStub' (0.35x damage plus an `intendedStatus: "generic-ailment"` marker that nothing ever applies). The full status machinery (inflictStatus, turn gates, poison ticks) exists and works for player-side items/PSI, but no enemy action path calls it, so the party can never be poisoned/paralyzed/put to sleep by enemies.
- **EB parity note:** EB enemies routinely inflict poison (Ramblin' Evil Mushroom → mushroomization, snakes → poison, hypnosis → sleep, etc.) and cast real PSI with per-spell damage. High confidence this is a gap; the code comments acknowledge it as a stub pending ROM decode of the action routines.
- **recommendation:** Author a per-actionId effect table for the Act-1 enemy roster (even hand-authored, not ROM-decoded) mapping status actions to inflictStatus calls and PSI actions to psiEffectAmount-style damage; the intendedStatus marker is already threaded through the resolution for exactly this.

### F16 · Killing blow's damage/defeat message is cut off after ~1 frame when the last enemy dies

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleScene.ts:921`, `apps/game/src/battleScene.ts:960`, `apps/game/src/battleScene.ts:1068`
- **evidence:** advanceBattleFlow() (called every update) and advanceExecutionStep() both call handleBattleOutcome() FIRST, before honoring actionDelayMs. Enemy HP snaps displayed=0 instantly on death (applyDamage), so on the frame after the killing step resolves, outcome()==='win' and beginVictorySummary() replaces the execution message with the tally. The kill step's computed dwell (ACTION_ADVANCE_DELAY_MS + ACTION_ADVANCE_DEFEAT_DELTA_MS at 1068-1069, clearly intended to linger on the defeat beat) is only ever observed for non-final kills. Code-confirmed; not frame-captured in-engine.
- **EB parity note:** EB displays the final "(enemy) was defeated!" beat (with the defeat dissolve) before cutting to "YOU WON!". High confidence.
- **recommendation:** In advanceBattleFlow, when phase==='execution', wait for actionDelayMs to drain before calling handleBattleOutcome (move the outcome check after the delay gate, as advanceExecutionStep is already only called on delay expiry).

### F17 · Battle RNG is fully deterministic per enemy group — identical fights replay identically

- **status:** DIVERGES · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:475`, `apps/game/src/battleScene.ts:531`
- **evidence:** battleRngSeedForGroup(groupId, enemies) = (groupId+1)*65537 + sum(enemyIds); no per-encounter entropy. Confirmed in-engine: two separate probe runs vs battle group 3 produced the exact same sequence — first bash deals 17, enemy guts-saves at 1 HP, second bash 'dodged swiftly', enemy counterattacks for 1. Any re-fight of the same group with the same party state replays move-for-move.
- **EB parity note:** EB battles vary run to run (RNG state carries across the session). Deterministic seeding is great for the test harness but is player-visible sameness EB doesn't have. High confidence.
- **recommendation:** Mix a per-encounter nonce (e.g. world-scene encounter rngSeed or step counter, already carried in BattleReturnEncounterState.rngSeed) into the seed, and let tests/?battle= keep the pure group seed for reproducibility.

### F18 · Battle-only ailments (asleep/confused/shielded) persist after battle into the overworld and the next fight

- **status:** DIVERGES · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleScene.ts:3463`, `apps/game/src/statusEffects.ts:1`, `apps/game/src/partyState.ts:658`, `apps/game/src/characterModel.ts:106`
- **evidence:** buildPostBattlePartySnapshot copies ALL combatant.statuses into the snapshot (3463-3467); partyState.commitStatuses persists them; buildCombatantFromPartyMember carries them into the next battle (characterModel.ts:106). No battle-end code cures volatile ailments. A member asleep/confused/shielded when the fight ends stays that way indefinitely in the field HUD and starts the next battle gated — sleep can only clear via its in-battle wake roll. This also contradicts the statusEffects.ts header, which states statuses are battle-scoped and never serialized.
- **EB parity note:** EB clears battle-scoped effects (sleep, shields, offense/defense buffs) when the battle ends; only persistent ailments (poison, paralysis, sunstroke, cold, mushroomization) survive to the field. High confidence.
- **recommendation:** On battle end (buildPostBattlePartySnapshot or applyBattleResult), filter statuses to the persistent set (poisoned, paralyzed) before persisting, and update the statusEffects.ts doc comment to describe the actual persistence contract.

### F19 · DEFEND bypasses the paralyzed/asleep turn gate and skips the defender's poison tick

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleRound.ts:336`, `apps/game/src/battleRound.ts:426`, `apps/game/src/battleRound.ts:345`
- **evidence:** resolveRoundStep returns defendAnnouncementRoundStep for a queued party DEFEND before beginCombatantTurn/resolveCombatantTurnGate and outside withEndOfTurnPoisonTick (336-338; the switch-case at 426 is inside the gated path but the early return at 336 is not). So a paralyzed or asleep member still 'takes a defensive stance', and a poisoned defender takes no end-of-turn poison damage that round — Defend becomes a poison-immunity turn.
- **EB parity note:** In EB, paralyzed/asleep characters cannot take any action including Defend, and poison ticks regardless of the chosen action. Medium-high confidence.
- **recommendation:** Route the DEFEND case through the same beginCombatantTurn → resolveCombatantTurnGate → withEndOfTurnPoisonTick pipeline as other commands (the guard stance is already applied at round start by applyRoundStartGuardStance, so gating the announcement is safe).

### F20 · Shield-reduced damage is mis-narrated (and guts lethality mis-computed) on non-physical damage paths

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:1053`, `apps/game/src/battleLogic.ts:799`, `apps/game/src/battleLogic.ts:940`, `apps/game/src/battleLogic.ts:560`
- **evidence:** applyDamage scales by incomingDamageScale (shield), and the physical path narrates via shieldedDamage() to match. But resolvePsiTurn (amount=psiEffectAmount, 1053-1067), resolveMirrorTurn (799-809), and enemy psi/statusStub actions (940-942, totalAmount += amount pre-scale) all narrate the UNscaled amount while applying scaled damage — a shielded target's displayed damage number overstates the HP actually lost by 2x at default shield. Additionally resolvePhysicalAttackDamage's guts lethality check (560-573) compares pre-shield damage to hp.target, and its 'survive at 1 HP' clamp (hp.target-1) is shield-scaled again in applyDamage, so a shielded guts-survivor ends above 1 HP and non-lethal shielded hits can consume the guts roll.
- **EB parity note:** EB's displayed damage always equals HP lost (shields halve/reflect before display), and guts survival leaves exactly 1 HP. Medium confidence on the exact EB shield-display mechanics, high confidence the model is internally inconsistent.
- **recommendation:** Apply the shield scale once at a single choke point (e.g. inside the resolution functions before applyDamage, passing pre-scaled damage with ignoreShield, as the poison path already does) so narrated amount === applied amount, and run the guts check on the post-shield amount.

### F21 · Failed run discards every party member's queued command after they were all collected

- **status:** ROUGH · **severity:** low · **class:** needs-creative-call · **confidence:** medium
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleRound.ts:286`, `apps/game/src/battleScene.ts:884`
- **evidence:** resolveRoundStartPriority returns queued: [] whether the run succeeds OR fails (286-311), and only the first living RUN-queuer attempts. beginExecutionPhase then builds the turn order from the emptied queue, so on a failed escape all party actions (including other members' BASH/PSI picks, entered after the RUN pick) are silently thrown away while every enemy acts. Input UX still walks through all remaining members even though their commands can be discarded.
- **EB parity note:** EB's 'Run away' ends command input for the whole party immediately and a failed escape forfeits the party's round — the round-forfeit matches, but EB never collects then discards other members' commands. Medium confidence on the exact EB input flow.
- **recommendation:** Either end command input immediately when RUN is confirmed (EB-style, making the discard moot), or on failure execute the other members' queued commands. The former is the smaller change (return complete:true from confirmCommand for RUN).

### F22 · Structural trivia: dead helpers in battleScene, stale enemySpeed cast, duplicate parallel test trees

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleScene.ts:3735`, `apps/game/src/battleScene.ts:3808`, `apps/game/src/battleLogic.ts:2243`, `apps/game/src/battleLogic.test.ts:1`, `vitest.config.ts:5`
- **evidence:** (a) battleScene module-level functions livingEnemyIndices/livingPartyIndices/clampIndex (3735-3748) and messageForBlockedAction (3808) have zero call sites (rg finds only definitions; tsc noUnusedLocals doesn't flag module-scope functions). (b) enemySpeed() casts `(enemy as BattleEnemy & { speed?: number }).speed` but BattleEnemySchema has had a required speed field since (packages/eb-schemas/src/index.ts:1416) — the fallback-to-level path is unreachable with real data. (c) vitest include matches both apps/game/src/*.test.ts and apps/game/test/*.test.ts; battleLogic and statusEffects have older, smaller duplicate test files in src/ alongside the fuller test/ versions — redundant runs and a confusing home for new tests.
- **EB parity note:** N/A (code hygiene).
- **recommendation:** Delete the four unused battleScene helpers, simplify enemySpeed to read enemy.speed directly, and fold the src/*.test.ts duplicates into apps/game/test/ (or exclude one tree in vitest.config).

### F23 · Core round flow, mortal-wound odometer, and pure-model test coverage are solid

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleRound.ts:176`, `apps/game/src/battleLogic.ts:1342`, `apps/game/src/rollingMeter.ts:68`, `apps/game/test/battleRound.test.ts:1`
- **evidence:** Confirming the load-bearing parity machinery works as designed: EB two-phase rounds (collect all commands via nextInputState, resolve by speed-jittered order), rolling HP odometer with the mortal-wound window (isCombatantAlive keyed on DISPLAYED HP, settlePendingPartyMortalWounds rescues at battle end — enemy snaps to 0 instantly, matching EB's hidden enemy HP), guts survival, SMAAAASH, instant-win advantage, first-strike swirls, per-character command sets, revive targeting fainted allies, and confusion targeting that doesn't perturb the RNG when unconfused. Probes confirmed the flow end-to-end (command-input → target → execution with dwell → next round; guts-save left the enemy at exactly 1 HP). Pure modules all have dedicated tests (battleRound, battleLogic, rollingMeter, battleEvents, battleMessages, battleAutoPolicy, battleEffects, characterModel, encounterLogic, statusEffects, battleSfxPlan, music, worldMusic); tsc is clean. The Web Audio synth SFX/music layer (not SNES samples) and the clean-UI battle windows are approved intentional divergences.
- **EB parity note:** The round model matches EB's documented battle structure closely; the presentation skin is intentionally custom.
- **recommendation:** No action; recorded so the fix-candidates above are read against an otherwise healthy foundation. The only untested seam is battleScene itself — the two confirmed scene-layer bugs (equip compounding, outcome short-circuit) both live exactly in that untested glue, so a thin headless scene-flow test would pay for itself.

## Dimension: code-pipeline

**Coverage:** EXAMINED: scripts/build-eb-fullworld.ts (full read: validation set + copy-list), apps/game/src/loader.ts (full read: every /generated fetch + zod coverage), packages/eb-converter/src/world.ts + fts.ts (full read) + coilsnakeYaml.ts (parser core), packages/eb-converter/src/validate.ts (schema coverage of pnpm validate), packages/eb-schemas/src/index.ts (strictness survey via grep: .strict() used pervasively), scripts/ triage (package.json references, stamp-buildings.mjs + snapshot-clean-chunks.mjs + gen-collision-overrides.mjs + gen-sector-music.mjs full reads, stamp-signs history via git), byte-level diff of all content/*.json vs apps/game/public/generated/*.json, git history of the drifted files, and a one-off node/tsx script that zod-validated all 22 schema'd content files plus 6 key generated copies (result: 0 failures). Music-manifest file references checked against disk (0 missing locally; audio/jammers is gitignored). CONTENT-FILE MAP (file -> schema -> loader slot -> generated copy): added-npcs->AddedNpcsSchema->addedNpcs->SAME(copied, NOT build-validated); background-overrides->BackgroundOverridesSchema->backgroundOverrides->SAME(validated+image check); battle-rules->validated->SAME; building-overrides->NO SCHEMA (raw JSON.parse in stamp-buildings/snapshot-clean-chunks, build-time only, no generated copy); building-tile-kit->no schema (authoring tool input, n/a); character-overrides->CharacterOverridesSchema->characters merge->SAME(NOT build-validated); collision-overrides->CollisionOverridesSchema->collisionOverrides->SAME(optional copy, NOT build-validated); custom-dialogue->CustomDialogueSchema->customDialogue->SAME(NOT build-validated); cutscenes->validated->SAME; drifella-barks->validated->SAME; drifella2-roster->no schema (authoring reference, n/a); enemy-name-families->EnemyNameFamiliesSchema->expanded to generated/enemy-overrides.json (present); enemy-stat-overrides->validated->SAME; item-overrides->ItemOverridesSchema->items merge->SAME(NOT build-validated); music-manifest->MusicManifestSchema(.strict)->musicManifest->STALE generated; npc-overrides->validated->SAME; opening-cutscene->validated optional->SAME; overworld-enemy-skins->OverworldEnemySkinsSchema->expanded into generated/sprite-overrides.json->expansion MISSING from committed generated copy; overworld-interactables->validated optional->SAME; psi-overrides->validated->SAME; sector-music->SectorMusicSchema->sectorMusic->SAME(optional copy, NOT build-validated); sign-names/sign-overrides->no schema (stamp-signs superseded; positions reused by re-sign authoring); sprite-overrides->SpriteOverridesSchema->spriteOverrides->STALE generated (no overworldByEnemyId); swagbound-dialogue-library->schema->dialogueLibrary->STALE generated; tile-overrides->TileOverridesSchema->converter input (runtime never fetches; copy harmless)->SAME; triggers->StoryTriggersSchema(+barrier image check)->storyTriggers->STALE generated. NOT EXAMINED: converter modules battle.ts/itemsPsi.ts/shops.ts/encounters.ts/characters.ts/font.ts/window.ts/png.ts/romStart.ts (out of time-budget; only world/fts/yaml audited in depth); the ~40 playtest/probe .mjs scripts line-by-line (triaged as live manual tooling per project memory); atlas/ scripts; chunk PNG binary drift; generated/world.json content (covered by pnpm validate, not re-run); NO in-engine probe was run — the probe base URL in my instructions was literally "undefined", so runtime behavior of the stale files on the currently-running dev server is inferred (clean git status implies no rebuild has run on this working tree since the last commit), not observed. NO builds were run (per rules).

### F24 · Committed generated/ copies drifted from content/ source: stale triggers, music-manifest, dialogue-library, and sprite-overrides missing the entire overworld enemy-skin expansion

- **status:** ROUGH · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** CONFIRMED — Every evidentiary claim checks out in the current checkout. (1) Byte diffs confirm all four stale files: generated/music-manifest.json is missing the boss cue and points overworld/battle/interior/intr
- **files:** `apps/game/public/generated/music-manifest.json:1`, `apps/game/public/generated/triggers.json:88`, `apps/game/public/generated/sprite-overrides.json:1`, `apps/game/public/generated/swagbound-dialogue-library.json:5`, `scripts/build-eb-fullworld.ts:159`
- **evidence:** generated/ is git-tracked (commit f90408b 'make repo fully self-contained') and byte-diff vs content/ shows 4 stale files: (1) generated/music-manifest.json lacks the intro and boss cues and still points overworld/battle cues at old placeholders audio/music/overworld.mp3 instead of the jammers tracks in content/; (2) generated/triggers.json lacks the "music": "ending" field on the act1:complete trigger; (3) generated/swagbound-dialogue-library.json lacks the passthrough:empty entry; (4) generated/sprite-overrides.json has ZERO occurrences of overworldByEnemyId while build-eb-fullworld.ts generateSpriteOverridesWithOverworldSkins (line 159-173) always writes that key expanded from content/overworld-enemy-skins.json (30+ families) — git log shows content and generated sprite-overrides were last touched in the SAME commit (78a6414) as byte-identical copies, i.e. hand-copied rather than built. git status is clean, so no build has run on this working tree since the last commit: any server started via dev:serve/plain vite, and any consumer of the committed generated data, gets old music placement, no ending-music hook, and EB sprites on all roaming overworld enemies.
- **EB parity note:** Not an EB-parity question per se, but the stale sprite-overrides drops the approved Swagbound overworld enemy skins (visible roaming enemies revert to raw EB sprite groups) and the stale music-manifest reverts Nick's verified 2026-06-29 track placement. High confidence in the data diff itself.
- **recommendation:** Run pnpm build:eb-fullworld and commit the regenerated files, then add a CI/verify check that rebuilds and fails on a dirty generated/ tree (the 'pnpm verify' chain already rebuilds twice — add a git-diff --exit-code on generated/*.json between them). Alternatively stop tracking the derived JSONs that are pure copies/expansions of content/.

### F25 · loader.ts loadJson swallows all errors silently — an invalid or missing generated layer (collision-overrides, triggers, cutscenes...) disappears with zero console signal

- **status:** ROUGH · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** CONFIRMED — Evidence holds exactly as cited. (1) loadJson at apps/game/src/loader.ts:153-160 is `try { fetch; return schema.parse(await response.json()) } catch { return undefined; }` — no response.ok check, no l
- **files:** `apps/game/src/loader.ts:153`, `apps/game/src/loader.ts:295`
- **evidence:** loadJson (loader.ts:153-160) is `try { fetch; return schema.parse(...) } catch { return undefined; }` — it conflates 404, network failure, malformed JSON, and zod validation failure into a silent undefined. All 20 authored layers flow through it. GameData then treats undefined as 'layer absent': collisionOverrides undefined re-opens roof-walking (the authored fix on this very branch), storyTriggers undefined removes every progression gate, cutscenes/battleRules/musicManifest likewise vanish. Nothing is logged, so a schema drift between eb-schemas and a generated file degrades gameplay with no diagnostic anywhere.
- **EB parity note:** Not an EB behavior question; this is pipeline robustness. EB (a ROM) cannot lose data layers at load time — the rebuild can, silently.
- **recommendation:** Log the file URL + zod issues (console.warn at minimum, ideally surface in __firstSceneDebug) in the catch, and consider making files that gate progression/collision (triggers, collision-overrides, world) hard-fail instead of soft-undefined.

### F26 · Seven content files are copied into generated/ with no build-time schema validation, and runtime validation failure is silent (compounds the previous finding)

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `scripts/build-eb-fullworld.ts:115`, `scripts/build-eb-fullworld.ts:128`
- **evidence:** copyContentOverlaysToGenerated validates 12 of the copied files (lines 116-127) but blind-copies 7: added-npcs.json, custom-dialogue.json, swagbound-dialogue-library.json, item-overrides.json, character-overrides.json, sector-music.json, collision-overrides.json (lines 128-150). A malformed hand edit to e.g. content/collision-overrides.json (the roof-walking fix) or custom-dialogue.json (the entire Swagbound voice) ships through the build and is then silently dropped at runtime by loadJson's bare catch. Coverage elsewhere is partial: custom-dialogue/added-npcs are parsed in vitest (qa-npc-dialogue.test.ts:40-42) but pnpm test is the heavy chunk-rebuilding path and not part of every workflow; collision-overrides and sector-music have no test coverage at all. I verified all 7 currently parse cleanly (one-off zod run, 0 failures), so this is a latent gap, not a live break.
- **EB parity note:** Pipeline hygiene, not EB behavior. High confidence in the code reading; the failure scenario is hypothetical today.
- **recommendation:** Add the 7 missing validate* calls in copyContentOverlaysToGenerated — the schemas already exist and are imported in the same package; it is ~7 lines mirroring validateNpcOverrides.

### F27 · Converter foreground-occluder promotion is chunk-local: the bottom tile row of every 16-tile chunk can never see its south neighbor, losing walk-behind occlusion at chunk seams

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** medium
- **verdict:** unverified (verifier not run)
- **files:** `packages/eb-converter/src/world.ts:290`, `packages/eb-converter/src/world.ts:295`, `packages/eb-converter/src/world.ts:1159`, `packages/eb-converter/src/fts.ts:89`
- **evidence:** buildFullWorldArtifacts composes each 16x16-tile chunk independently (world.ts:1157-1165 passes chunk-only bounds to composeRegion). Inside composeRegion, solidCountAt (world.ts:290-293) returns 0 for any tile outside the chunk bounds, and isOccluderTile requires belowSolidCells >= 8 (fts.ts:81-91). Therefore a solid roof/wall tile sitting on the last row of a chunk (map tile rows 15, 31, 47...) whose supporting solid tile is in the next chunk south is never promoted to the foreground layer — the player sprite will draw ON TOP of that structure row instead of walking behind it. Priority-bit cells still promote, but the fts.ts comment (line 215) notes decompiled .fts files may not carry priority bits, so the solid heuristic is the load-bearing path. mapRows for the whole map are available in scope, so the fix is to consult the true map neighbor instead of clamping to chunk bounds. NOT verified visually in-engine (no probe URL available); code-level logic is unambiguous.
- **EB parity note:** EB SNES renders building tops above the player via tile priority everywhere, with no chunk seams — any row where the rebuild fails to occlude diverges from EB layering. Confident about EB's behavior; medium confidence the artifact is visible in practice (roof collision-overrides now make many such cells unreachable, masking it).
- **recommendation:** In buildFullWorldArtifacts, compute occlusion from the full-map solid grid (or pass a one-tile-south lookahead row into composeRegion) instead of clamping solidCountAt to chunk bounds. Then eyeball a building that straddles y=15/31 chunk seams before/after.

### F28 · Music manifest file paths are never existence-checked at build, and the committed manifest references gitignored audio/jammers files

- **status:** ROUGH · **severity:** low · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `scripts/build-eb-fullworld.ts:209`, `content/music-manifest.json:4`, `.gitignore:43`
- **evidence:** validateMusicManifest (build-eb-fullworld.ts:209-211) is schema-only, unlike sprite/background/barrier images which all go through validatePublicAssetImage (lines 168, 205, 261). content/music-manifest.json points every cue at audio/jammers/*.mp3, and .gitignore:43 excludes apps/game/public/audio/jammers/ (only 30 audio files are tracked: music/ + sfx/). All referenced files exist locally (I checked: 0 missing), but a fresh clone gets a manifest full of dangling references, and a typo'd path in a future edit would pass the build silently.
- **EB parity note:** The original-music layer is an approved intentional divergence (Nick's own tracks, local-only by prior decision), so gitignoring the mp3s may be deliberate; the missing existence check is still a pipeline gap for local authoring.
- **recommendation:** Add a validatePublicAssetImage-style existence check for manifest track files that WARNS (not fails) when a file is absent, so local typos are caught without breaking clean clones. Decide separately whether jammers tracks should ship in the repo.

### F29 · Copy-list completeness confirmed: every generated JSON the runtime loader fetches is produced by build:eb-fullworld, and all current content passes schema validation

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/loader.ts:246`, `scripts/build-eb-fullworld.ts:128`
- **evidence:** Cross-checked all 20 non-manifest /generated/*.json fetches in loadGameData (loader.ts:246-299) against copyContentOverlaysToGenerated plus the two generator paths (sprite-overrides expansion, enemy-overrides from families): zero gaps — the sign-stamp/collision-overrides/sector-music copy pattern holds for every runtime file, including the new overnight files (overworld-interactables, opening-cutscene). The optional-copy pattern (copyOptionalJsonToGenerated) matches the loader's optional handling. My zod validation run over 22 content files + 6 generated files reported 0 failures, and schemas are pervasively .strict() (dozens of .strict() calls in eb-schemas/src/index.ts), so unknown-key authoring mistakes (the MusicManifestSchema 'comment' gotcha) are caught at build. tile-overrides.json is copied to generated but never fetched at runtime (converter input only) — harmless.
- **EB parity note:** N/A — positive pipeline confirmation requested by the audit scope.
- **recommendation:** No action. Keep the pattern: new content files must be added to both copyContentOverlaysToGenerated and loadGameData in the same PR.

### F30 · Dead/legacy tooling and stale-doc grab-bag: superseded stamp-signs, legacy worldScene, hardcoded stale scratchpad path in gen-collision-overrides, unschema'd building-overrides, 'gitignored' doc comments now false

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `scripts/stamp-signs.mjs:1`, `apps/game/src/worldScene.ts:1`, `scripts/gen-collision-overrides.mjs:22`, `scripts/stamp-buildings.mjs:25`, `packages/eb-converter/src/fts.ts:16`, `scripts/build-eb-full.ts:1`
- **evidence:** (1) stamp-signs.mjs was deliberately dropped from build:eb-fullworld in commit 14cf1d7 (superseded by the re-sign building patches; sign-overrides.json positions still feed that authoring pipeline) but the script remains and project memory still describes it as wired-in — confusion risk, not breakage. (2) worldScene.ts is the legacy image-based scene, unused by the full-world build. (3) gen-collision-overrides.mjs:22 hardcodes OUT to a previous session's scratchpad dir (/private/tmp/claude-501/.../e24bac65-.../collision-candidates.json) — writeFileSync will ENOENT once that dir is cleaned; it is otherwise SAFE (writes review candidates only, never touches content/). (4) building-overrides.json is the only build-input content file parsed with raw JSON.parse and no zod schema (stamp-buildings.mjs:25, snapshot-clean-chunks.mjs:15); a malformed chunk string degrades to a per-entry 'skip' warning, so low risk. (5) fts.ts:14-16 and world.ts:782 doc comments still claim generated output is 'gitignored' — false since commit f90408b tracked it; misleading for the drift finding above. (6) build-eb-full.ts is a documented back-compat alias, fine. gen-sector-music.mjs and vary-crowd-skins.mjs are safe regenerators (deterministic from EB source / write content sprite-overrides respectively). No atlas:motifs-class clobber found in the audited scripts.
- **EB parity note:** N/A — repo hygiene.
- **recommendation:** Delete or clearly mark stamp-signs.mjs and worldScene.ts as legacy; parameterize gen-collision-overrides OUT (env var or argv); add a minimal BuildingOverridesSchema; fix the two 'gitignored' comments.

## Dimension: animations

**Coverage:** Examined: playerController.ts, playerVisualState.ts, spriteOverrides.ts + content/sprite-overrides.json + apps/game/public/generated/sprite-overrides.json, npcController.ts, overworldEnemies.ts, battleVisuals.ts, battleEffects.ts, battleScene.ts (enemy effect/wobble/lunge/victory-tally regions), cutsceneRunner.ts, cutsceneActorMovement.ts, content/cutscenes.json, dialogueRenderer.ts, transitions.ts, battleBackground.ts, and the relevant chunkedWorldScene.ts regions (player/NPC/follower/overworld-enemy sync, cutscene host, encounter swirl, visual-state application). In-engine (headless chromium on the live :5173 dev server, ~6 probe sessions): mid-walk frame sampling in all 4 directions with screenshots, NPC interact facing test (npc 191), forced battle (?battle=1&party=2) stepping a full round while watching __battleDebug fx counters and enemy wobble, and a full live run of the onett-police-disperse cutscene with per-tick actor positions plus a data cross-check of every hideActor npc's eventFlag across all 6 cutscenes. NOT examined: introScene title choreography, teleport-spin/water-wade/KO/bike/ladder/rope states in-engine (code-read only; ladder/rope/bike are unreachable without forced state), the swirl and defeat-dissolve visually (code-read; ?battle bypasses the swirl), victory tally visually (code + debug fields only), the other 4 authored cutscenes in-engine, NPC wander/patrol visuals (state machine code + unit tests only), 3rd/4th hero art in-engine (Act-1 duo party loaded), and PSI element flash profiles in-engine. Screenshots partially occluded by the dev-only Track Lab panel, so enemy drop-shadow appearance was not visually confirmed.

### F31 · Second party member has no overworld follower sprite — spriteOverrides.follower never authored

- **status:** MISSING · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED (orchestrator code-read: no follower key, no party[] fallback)
- **files:** `apps/game/src/chunkedWorldScene.ts:5606`, `apps/game/src/chunkedWorldScene.ts:5615`, `content/sprite-overrides.json`, `packages/eb-schemas/src/index.ts:506`
- **evidence:** spawnFollower() only creates a follower when spriteOverrideSheet(this.data_.spriteOverrides?.follower) resolves AND its texture loaded (chunkedWorldScene.ts:5615-5618); there is no fallback to party[1].sprite or to the raw EB Paula sheet. Both content/sprite-overrides.json and the runtime-loaded apps/game/public/generated/sprite-overrides.json have keys [schema, player, byNpcId, byEnemyId, bySpriteGroup, overlays, party] — NO 'follower' key (verified by script). In-engine: overworld HUD shows two members (Bosch + Cloak) and Cloak acts in battle ('Cloak's attack!' in __battleDebug), but mid-walk screenshots show only the lead sprite — nothing trails 26px behind. The entire follower pipeline (trail, path-distance follow, movement-driven frame cycling every 8px, shared visual states, per-follower state sheets, lines 5624-5737) is built and dead.
- **EB parity note:** In EarthBound every party member visibly trails the leader in a chain on the overworld. High confidence — this is core EB presentation. A duo party with an invisible second member is a clear parity break.
- **recommendation:** Author a follower entry in content/sprite-overrides.json (Cloak / lsw-224 walk sheet + state sheets, same shape as player), or derive it at load time from party[] joinOrder 2 so it can never drift. Longer term, generalize spawnFollower to a chain for members 3-4 (see separate finding).

### F32 · Cutscene-hidden NPCs reappear after any battle or reload: hideActor persistence flags are wrong/missing

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `content/cutscenes.json`, `apps/game/src/chunkedWorldScene.ts:1050`, `apps/game/src/battleScene.ts:1719`, `apps/game/public/generated/world.json`
- **evidence:** onett-police-disperse authors eventFlag 289 as the only persistent hide, but world.json shows the five cops key off DIFFERENT flags: npc 73→289, 74→290, 75→291, 76→292, 77→293 (all showSprite 'when event flag unset'). Cross-check script output: 4 of 5 police hideActors 'NOT COVERED', plus onett-keep-on-task npc 199 (flag 469) uncovered. Runtime hides go through cutsceneVisibilityOverride, which is cleared on scene create (chunkedWorldScene.ts:1050, comment admits 'Overrides reset on scene start'), and battle return does a full scene.start of chunked-world (battleScene.ts:1719). So after the police scene, one battle (or save/load) resurrects cops 74-77 at their original posts while flag signal:police-dispersed says they left, and the once-only cutscene will not re-fire. Verified the cutscene itself runs correctly live (cops file out one by one to 7640,208).
- **EB parity note:** EB sets the per-NPC event flags via its scripts so dispersed NPCs stay gone permanently. High confidence on intent — the cutscene's own comment says 'stay gone (EB flag 289)'; the ROM actually uses one flag per cop sprite (289-293 per converter data).
- **recommendation:** Add eventFlag steps for 290-293 to onett-police-disperse (and 469 to onett-keep-on-task), or better: make the cutscene finisher persist cutsceneVisibilityOverride into a saved game-flag namespace so hideActor is durable by construction. Audit the two 'when event flag SET' transient actors (124/466, 148/474) separately — those may be intentionally transient.

### F33 · Battle enemies idle-wobble constantly (EB battle sprites are static)

- **status:** DIVERGES · **severity:** medium · **class:** needs-creative-call · **confidence:** high
- **verdict:** VERIFIED (orchestrator: constant alive-wobble at battleScene.ts:3159-3160; EB battle sprites are static, so removal is the parity-correct default — kept as creative call since it is aesthetic)
- **files:** `apps/game/src/battleScene.ts:3159`, `apps/game/src/battleScene.ts:2999`, `apps/game/src/battleEffects.ts:29`
- **evidence:** enemyEffectFor() applies wobbleOffset(now, index, 1.5px amp, 1600ms period) whenever the enemy is alive — not gated on being hit or acting (battleScene.ts:3159-3161), and the sprite position adds effect.wobble every frame (line 2999). In-engine probe confirms: during idle command-input phase, enemy wobble oscillated dx -1/0/+1 continuously across samples. Also related: a procedural ground drop-shadow ellipse is drawn under every enemy (battleVisuals.ts ENEMY_SHADOW_* constants, alpha 0.38).
- **EB parity note:** EarthBound enemy battle sprites are completely STATIC — no idle bob, no breathing, and no drop shadows; they sit flat on the distortion background. High confidence (explicitly part of this audit's parity doctrine). The hit flash / defeat flash-fade / lunge are fine EB-adjacent reactions; the constant idle motion is the divergence.
- **recommendation:** For strict EB parity, remove or zero the always-on wobble (keep the hit-reaction flash/lunge/shake, which only fire on events — verified via fx counters). The drop shadow is a smaller stylistic add; decide once: parity-static presentation vs 'juice'. Both are one-constant changes (DEFAULT_ENEMY_WOBBLE_AMP_PX, ENEMY_SHADOW_ALPHA).

### F34 · Encounter swirl ignores battle advantage — no green/red swirl variants

- **status:** MISSING · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED (orchestrator: drawSwirl(progress) in transitions.ts has no advantage/color param; the advantage MECHANIC works (F57) — only the green/red swirl visuals are missing)
- **files:** `apps/game/src/chunkedWorldScene.ts:4910`, `apps/game/src/transitions.ts:62`, `apps/game/src/overworldEnemies.ts:73`
- **evidence:** touchAdvantage() correctly computes partyFirstStrike/enemyFirstStrike/normal from facing geometry (overworldEnemies.ts:73-88, comments even name them 'green swirl'/'red swirl'), and the advantage is passed to the battle scene for turn order (chunkedWorldScene.ts:4820-4824, 4877). But the transition itself always renders the same hue-cycling multicolor spiral: tickEncounterSwirl calls drawSwirl(g, 1-p, w, h, {clockMs}) with no advantage input, and drawSwirl/swirlMask have no color/tint parameter tied to advantage (transitions.ts). The battle-side reveal (battleScene.ts:1702) is likewise uncolored.
- **EB parity note:** EarthBound tints the pre-battle swirl GREEN when the party gets the first strike and RED when the enemy ambushes you; the normal encounter swirl is uncolored. High confidence — this is well-documented EB behavior and the code comments acknowledge it.
- **recommendation:** Thread encounterAdvantage into beginEncounterSwirl and give drawSwirl an optional tint mode (green wash for partyFirstStrike, red for enemyFirstStrike) applied to the band hues; keep the current multicolor as the 'normal' style if the rainbow look is a deliberate Swagbound choice.

### F35 · All 399 skinned NPC overrides are single-frame: walk cycles render as a procedural hop and facing changes are invisible

- **status:** ROUGH · **severity:** medium · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `content/sprite-overrides.json`, `apps/game/src/spriteOverrides.ts:55`, `apps/game/src/chunkedWorldScene.ts:1758`, `apps/game/src/chunkedWorldScene.ts:3567`
- **evidence:** Data scan: 106/106 byNpcId and 293/293 bySpriteGroup overrides have exactly one frame ([0]) for ALL four directions. Moving skinned NPCs therefore animate via spriteWalkBobOffset (2.5px |sin| hop, spriteOverrides.ts:44-67) instead of a walk cycle, and every facing shows the identical frame — so the (correctly working) turn-to-face-player on talk (verified live: npc 191 flipped facing down→right and paused on interact, chunkedWorldScene.ts:3567) has zero visual effect for any skinned NPC. Raw EB-sheet NPCs and all four heroes are unaffected (heroes have 4-frame per-direction cycles, verified cycling 8→9→10→11 at 150ms while walking right, feet anchored, origin 0.5/1).
- **EB parity note:** EB NPCs have 2-frame walk cycles and distinct art per facing, and visibly turn to face you when addressed. High confidence. The hop-bob is an acknowledged in-code approximation ('single-frame Swagbound skins have no walk-cycle frames, so while they move they hop in place').
- **recommendation:** Art-generation decision for Nick: extend the LSW skin pipeline to emit at least 2-frame down/left/right/up strips (the override schema + runtime already fully support multi-frame animations per direction — only the PNGs and frame lists are missing). Prioritize interactable/service NPCs where the invisible facing-turn hurts most.

### F36 · Ladder/rope/bike hero state art is authored but unreachable in normal play

- **status:** MISSING · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:5416`, `apps/game/src/playerVisualState.ts:62`, `content/sprite-overrides.json`
- **evidence:** All four heroes ship dead/bike/ladder/rope state sheets (content/sprite-overrides.json player.states + party[].sprite.states) and the resolver + render layer implement sheet-swap, locked poses, and follower mirroring — but currentVisualStateInputs() hard-codes onLadder/onRope/riding to defaults with the comment 'ladder/rope/bike real triggers await tile-class data + a mount mechanic; forced-path for now' (chunkedWorldScene.ts:5416). Only KO (real HP signal) and deepWater (real surface mask) are live; ladder/rope/bike only fire via forced/debug state.
- **EB parity note:** EB Act 1 has real ladder/rope traversal (Giant Step cave ladders use a dedicated climbing sprite) and the bike from Punk-Sure in Onett. Medium-high confidence on the ladder claim for Act-1 scope; bike is optional early.
- **recommendation:** Wire surface/tile-class ladder detection (the .fts surface flags in external/coilsnake-full expose stairs/ladder classes) to onLadder, matching how deepWater already reads SURFACE_WATER_MASK. Bike needs the mount mechanic first — defer.

### F37 · Only one follower slot exists — heroes 3 and 4 can never appear in the overworld chain

- **status:** MISSING · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:5624`, `apps/game/src/spriteOverrides.ts:28`, `packages/eb-schemas/src/index.ts:506`
- **evidence:** The follower system is singular by construction: one FOLLOWER_SPRITE_OVERRIDE_SHEET_KEY, one this.follower object, one followerTrail, and the schema comment scopes it to 'the 2nd party member (Cloak)' (eb-schemas index.ts:506). spawnFollower checks party().length < 2 but never iterates members. When Munch (lsw-855) and Knight (lsw-2821) join, they will have no overworld presence even after the follower content gap (separate finding) is fixed.
- **EB parity note:** EB renders the full party chain (up to 4 members plus guests like the Runaway Dog and Bubble Monkey) trailing the leader by fixed path distance. High confidence.
- **recommendation:** Generalize the trail-follow logic (it already samples a path-distance trail) to N followers at 26px spacing increments, each with its own override sheet from party[]. Not urgent while Act 1 is a duo, but it blocks Acts 2+.

### F38 · Cutscene 'sound' step is a silent no-op

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:3881`, `apps/game/src/cutsceneRunner.ts:118`
- **evidence:** createCutsceneHost wires playSound: () => { /* content SFX cue: no sound sink wired for cutscenes yet */ } (chunkedWorldScene.ts:3881), so CutsceneRunner's sound op (cutsceneRunner.ts:118-120) does nothing. Currently latent: a scan of content/cutscenes.json shows 0 authored sound steps across the 6 cutscenes, so nothing breaks today — but any author using the documented op gets silence with no warning.
- **EB parity note:** EB scripted scenes routinely fire SFX cues (door slams, sirens, jingles) as part of choreography. High confidence.
- **recommendation:** Route playSound(id) through the same SFX sink the interactables/menus use (interactionSfx/transitionSfx infrastructure exists), or log a dev warning so authored cues aren't silently dropped.

### F39 · CutsceneRunner cannot express simultaneous actor movement

- **status:** ROUGH · **severity:** low · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/cutsceneRunner.ts:132`, `apps/game/src/chunkedWorldScene.ts:3873`
- **evidence:** moveActor is a blocking step (cutsceneRunner.ts:132-139) and the host tracks exactly one in-flight move (isActorMoveActive: () => this.cutsceneMove !== undefined, chunkedWorldScene.ts:3873), so authored scenes are strictly one-actor-at-a-time. Verified live in onett-police-disperse: cops 77→76→75→74→73 walked out sequentially, each taking ~1-1.3s, total ~6s of serialized exits — the authored comment even says they 'lose interest all at once' but the system can only file them out. Movement itself is clean: no teleporting, exact arrival at (7640,208), facing/walk frames driven by cutsceneActorMovement.
- **EB parity note:** EB's movement-code system runs NPC movement scripts concurrently (multiple actors walking in the same frame is common in EB scenes, including this police scene's inspiration). Medium-high confidence.
- **recommendation:** If scene fidelity for the remaining ~170 detected cutscenes matters, add a non-blocking moveActor variant (e.g. { op: 'moveActor', await: false } plus a waitAllMoves step) and track cutsceneMove as a map keyed by actor. If sequential staging reads fine creatively, leave it — the police scene works.

### F40 · Grouped low-impact animation trivia (dialogue beat pauses, 1-frame visibility flicker path, unskinned roamers, unhashed texture keys, legacy scene)

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/dialogueRenderer.ts:255`, `apps/game/src/chunkedWorldScene.ts:1767`, `apps/game/src/spriteOverrides.ts:27`, `apps/game/src/spriteOverrides.ts:118`, `apps/game/src/worldScene.ts`
- **evidence:** (a) perPagePauseMs (dialogueRenderer.ts:255) computes EB [pause] frame delays but is never called outside tests — the typewriter reveals at uniform 45cps, dropping EB's authored mid-line beats. (b) applyNpcRoomVisibility (chunkedWorldScene.ts:1767-1771) sets sprite visibility from the room mask only, omitting the cutsceneActorVisible override that syncNpc applies — hidden cutscene actors can flash for one frame on chunk/room refresh before syncNpc re-hides them. (c) overworldByEnemyId is empty (0 entries), so visible roaming enemies use raw EB sheets — they animate correctly (EB walk frames) but are unskinned, a known TODO. (d) Player/follower/npc-id override texture keys carry no image-path hash (sprite-override-player, sprite-override-npc-<id>, spriteOverrides.ts:27,118) unlike group/enemy keys which hash the path (the documented stale-Phaser-texture gotcha); safe today because each key maps 1:1 to an image per app run, but latent if content swaps images across in-app scene restarts. (e) worldScene.ts is a legacy image-based scene not used by the full-world build — dead code to prune.
- **EB parity note:** EB text uses [pause] control codes for comedic/dramatic beats (high confidence); the rest are engine hygiene items with no direct EB analog.
- **recommendation:** Fix opportunistically: apply perPagePauseMs (or per-segment pause offsets) to the reveal clock; include cutsceneActorVisible in applyNpcRoomVisibility; skin roamers when the art batch lands; add the path hash to player/npc keys for symmetry; delete worldScene.ts.

### F41 · Confirmed working (notable): hero walk cycles, NPC face-on-talk state, battle hit FX pipeline, two-phase rounds, victory tally, cutscene movement decode, typewriter

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/playerController.ts:149`, `apps/game/src/chunkedWorldScene.ts:5362`, `apps/game/src/battleScene.ts:3150`, `apps/game/src/cutsceneActorMovement.ts:8`, `apps/game/src/dialogueRenderer.ts:231`
- **evidence:** In-engine verification passed on every core loop this dimension covers: (1) hero walk cycles genuinely cycle with movement — frames 8→9→10→11 while walking right, 0→1→2→3 down, 150ms cadence, ~115px/s, idle resets to the facing's first frame, walk-in-place at walls (EB-like), feet anchored (origin 0.5,1), no foot-sliding; 4-frame cycles are richer than EB's 2 (fine — custom art). (2) NPC 191 paused and flipped facing toward the player on interact. (3) Battle FX counters increment exactly on events (shake 0→1→2, spark 0→1→2, flash 0→1→2→3, lunge on enemy attack; miss produced flash-only) with correct SFX ids (hit/miss/hpTick), across a genuine two-phase round (all commands collected, then speed-ordered execution with per-step messages). (4) First-person party presentation (no hero battle sprites) matches EB. (5) Victory tally uses rolling meters with tick SFX + page flourish (battleScene.ts:1187-1231). (6) Cutscene actors walk with real walk frames, face their travel direction, and arrive exactly on target with no teleporting (cutsceneActorMovement.ts + live police-scene trace). (7) Typewriter reveal at 45cps with complete-on-confirm semantics. (8) Follower frame cycling is movement-distance-driven (every 8px), immune to foot-sliding — once a follower actually renders.
- **EB parity note:** All of the above match EB behavior (or are approved Swagbound divergences: 4-frame hero cycles, custom skins). High confidence from combined code + live-probe evidence.
- **recommendation:** No action. Recorded so later audits don't re-litigate these as gaps.

## Dimension: battle-systems

**Coverage:** Examined in full: apps/game/src/battleLogic.ts, battleRound.ts, statusEffects.ts, encounterLogic.ts, overworldEnemies.ts (spawn/touch/advantage), partyState.ts item-effect decode + hospital, characterModel.ts growth/level-up; content/battle-rules.json, enemy-stat-overrides.json, psi-overrides.json, item-overrides.json; generated data battle.json (143 enemies, action tables), psi.json, items.json, encounters.json, shops.json; EB ground truth external/coilsnake-full (enemy_configuration_table.yml, battle_action_table.yml, enemy_groups.yml, psi_ability_table.yml, map_enemy_groups.yml); converter battle/encounter extraction (packages/eb-converter/src/battle.ts, encounters.ts). Ran a full item-effect coverage script (95 consumables), an enemy-action-type census (572 action slots), and 2 live in-browser probes (Coil Snake battle group 3: full two-phase round confirmed; PSI submenu flow at ?psi=all). NOT examined: battleScene.ts presentation internals (~3900 lines; only wiring greps for round pipeline/rewards/statuses), battleEffects/battleSfxPlan/battleVisuals beat timing, battleAutoPolicy heuristics, run-battle-matrix full execution, overworld PSI use from the pause menu, converter stat-extraction fidelity for enemy speed, exact EB direction of the map-enemy-group sub-group flag selector (reported with reduced confidence), and no live probe of a multi-round enemy status-stub turn (evidence is code+data, not screen).

### F42 · Enemy group formation Amounts dropped — every battle spawns only ONE of each enemy id

- **status:** DIVERGES · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED (orchestrator code-read: uniqueSorted discards Amount)
- **files:** `packages/eb-converter/src/battle.ts:154`, `packages/eb-converter/src/battle.ts:166`, `apps/game/src/battleScene.ts:3532`
- **evidence:** enemy_groups.yml group 450 = {Enemy 37 Amount 1, Enemy 209 Amount 2} but generated battle.json group 450 = enemyIds [37,209]; converter uses uniqueSorted(positiveEnemyIds(group)) which discards Amount, and battleScene enemiesForGroup maps each id to exactly one BattleEnemy. Census of enemy_groups.yml: 164 of 484 populated EB groups have total Amount > distinct ids (e.g. group 0 = 3x Spiteful Crow, group 36 = Cop + 2x Runaway Dog).
- **EB parity note:** EB formations routinely field multiple copies (Titanic Ant + 2 Black Antoids, Cop + 2 Runaway Dogs, punk trios); the Amount field in enemy_groups.yml is EB ground truth on disk. High confidence.
- **recommendation:** Emit per-entry amounts from the converter (enemyIds -> [{id, amount}] or repeated ids) and expand in enemiesForGroup. Directly affects the authored Act-1 boss gates: the Cop fight (group 36) is missing a dog and the Malady fight (group 450) is missing an antoid.

### F43 · Enemy action Direction dropped — ally-directed enemy actions (heals/self-buffs) resolve as attacks ON the party

- **status:** DIVERGES · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED (orchestrator code-read: Direction never parsed; targets are party-only)
- **files:** `packages/eb-converter/src/battle.ts:592`, `apps/game/src/battleLogic.ts:1586`, `apps/game/src/battleLogic.ts:901`
- **evidence:** battle_action_table.yml rows carry Direction: party|enemy but the converter emits only actionType+target (battle.ts:592-596). Runtime targetActorsForEnemyAction (battleLogic.ts:1586-1616) only ever selects PARTY members. Concrete case: Black Antoid (enemy 209) has all 4 action slots = EB action 32 (psi, Direction: party, PP 5, arg 23 = Lifeup α on an ally); in our engine its turns become 0.85x pseudo-physical damage against the player in the Titanic Ant boss fight instead of healing the boss.
- **EB parity note:** In EB the Black Antoids in the Titanic Ant fight heal the boss with Lifeup α; Direction: party means the action targets the user's own side. Confirmed from the local battle_action_table.yml + enemy_configuration_table.yml.
- **recommendation:** Emit Direction from the converter and route direction=party enemy actions at the enemy side (heal/buff), at minimum special-casing recovery-type psi actions. Changes the texture of the flagship Act-1 boss fight.

### F44 · Enemy status ('other') and psi actions are damage stubs — enemies can never inflict any ailment

- **status:** ROUGH · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** VERIFIED (orchestrator code-read: actionType 3/5 → flat damage stubs, arg unread; duplicate of F15)
- **files:** `apps/game/src/battleLogic.ts:1618`, `apps/game/src/battleLogic.ts:1636`, `apps/game/src/battleLogic.ts:940`
- **evidence:** enemyActionEffectKind maps actionType 5 ('other') to statusStub (resolved as 0.35x base damage + an intendedStatus:'generic-ailment' marker that nothing consumes) and actionType 3 ('psi') to a flat 0.85x base damage regardless of which PSI (arg is never read). Census: of 572 enemy action slots in battle.json, 206 are type 5 and 106 are type 3; 131 of 143 enemies carry at least one. Act-1 relevant: Coil Snake (id 55) actions 2,2,2,5 — its EB poison-fang slot never poisons; party-side inflictStatus machinery exists and works (psi-overrides Lull/paralysis probe-tested elsewhere) but enemies never use it.
- **EB parity note:** EB enemy 'other' actions include poison bites, crying, feeling-strange inducers etc., and enemy PSI uses the specific ability with its own damage/status. The code comment at battleLogic.ts:1647 acknowledges the ROM routine is undecoded. High confidence the current behavior diverges; exact per-action EB effects need ROM RE per the existing rom-re-method.
- **recommendation:** Author a per-actionId effect map (like item/psi overrides) for the Act-1 enemy roster first (Coil Snake poison, sleep/cry actions), reusing inflictStatus; leave the generic stub as fallback.

### F45 · Call-for-help enemy actions unimplemented — action arguments carried but never used

- **status:** MISSING · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:874`, `apps/game/src/battleLogic.ts:903`
- **evidence:** Insane Cultist (id 1) EB actions include 62 with arg 1 (summon another Insane Cultist); Titanic Ant has action 245 arg 176; Slimy Little Pile action 62 arg 45 (summons itself). battle_action_table 62/245 are 'other, dir: party, target: none' summon actions. resolveEnemyActionTurn never reads selection.action.arg, and BattleState has no way to add enemies mid-fight.
- **EB parity note:** EB enemies calling reinforcements is a signature mechanic (cultists multiplying is the Happy-Happy fight's whole gimmick). Confirmed from enemy_configuration_table.yml args; medium-high confidence these specific action ids are summons (arg = enemy id matches the summoned species in each case).
- **recommendation:** Implement a 'summon' effect kind keyed by actionId (62/245) that appends a buildEnemyCombatant(arg) to state.enemies up to a cap; Act-1 relevance is high if/when Insane Cultists are fought.

### F46 · Victory EXP is not split among living party members — everyone gets the full total

- **status:** DIVERGES · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:1176`, `apps/game/src/battleLogic.ts:1218`
- **evidence:** applyVictoryRewards computes expGained = sum of defeated enemies' experience, then maps over nextState.party applying applyExperienceToCombatant(member, expGained) to every living member with no division. A duo (Bosch+Paula) therefore levels roughly 2x the EB pace against unchanged EB exp tables.
- **EB parity note:** EarthBound divides total experience evenly among conscious party members (unconscious members receive none). Medium-high confidence in the EB claim (standard documented EB mechanic); the code behavior itself is certain.
- **recommendation:** Divide expGained by the count of living members (floor), matching EB; re-run scripts/act1.mjs to confirm the Act-1 curve still clears the Malady fight.

### F47 · Core damage/accuracy formulas are custom approximations, not EB's (off−def/2 vs 2·off−def; custom miss curve; enemies get 5% min SMAAAASH)

- **status:** DIVERGES · **severity:** medium · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:583`, `apps/game/src/battleLogic.ts:537`, `apps/game/src/battleLogic.ts:553`
- **evidence:** baseDamage = max(1, offense − floor(defense/2)) × 0.9–1.1 spread. Miss chance = clamp(0.10 + spdΔ/120 + luckΔ/220, 3%, 45%) — an authored curve (comment admits replacing an older /500 formula). smashChance = max(guts/500, 1/20) applies to ALL attackers, so guts-0 enemies SMAAAASH 5% of the time. Probe: Bosch (off ~20) hit Coil Snake (def 4) for 17 — EB's 2·off−def would deal ~36.
- **EB parity note:** EB physical damage ≈ 2×offense − defense with band variance; SMAAAASH = guts/500 with the 1/20 floor applying to party attackers; enemy base miss ≈ 1/16. High confidence on the 2·off−def core formula, medium on the floor's applicability to enemies. Boss-only enemy-stat-overrides (7 ids, all bossFlag) were tuned AGAINST the custom formula, so 'fixing' the formula would invalidate that tuning — this is a systemic rebalance decision, not a drop-in fix.
- **recommendation:** Decide once: either adopt EB formulas and retune enemy-stat-overrides via scripts/act1.mjs, or document the custom combat math as an intentional Swagbound system. At minimum drop the 5% enemy SMAAAASH floor (guts-0 enemies shouldn't crit).

### F48 · PSI PP costs and damage are flat per-strength tables; EB's real per-PSI PP costs sit unread on disk

- **status:** DIVERGES · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:313`, `apps/game/src/battleLogic.ts:1157`, `packages/eb-converter/src/itemsPsi.ts`
- **evidence:** STRENGTH_PP_COST = {alpha 4, beta 8, gamma 13, sigma 18, omega 24}; psiEffectAmount = 18+rank·12 (offense) / 24+rank·16 (recovery). Cross-checked EB psi_ability_table.yml→battle_action_table.yml PP costs: Rockin α=10 (ours 4), Fire α=6, Freeze α=4, Starstorm α=24 (ours 4), Flash α=8. Verified in-browser: PSI menu shows the flat 4/8/13/24 costs (screenshot battle-audit-2.png).
- **EB parity note:** EB PP costs are per-ability (in psi_ability_table.yml Action → battle_action_table PP Cost, present in external/coilsnake-full); EB PSI damage is per-action fixed bases with variance (ROM-side). High confidence on the PP divergence (data on disk); PSI damage divergence certain in code, EB values would need ROM RE.
- **recommendation:** Have the converter join psi_ability_table Action → battle_action PP Cost and emit ppCost per psi entry; keep the damage table as an authored knob or ROM-RE the action bases like the item pass did.

### F49 · All offensive/recovery PSI are single-target; EB targeting (all/row) is dropped

- **status:** DIVERGES · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:1035`, `apps/game/src/battleRound.ts:399`, `packages/eb-converter/src/itemsPsi.ts`
- **evidence:** resolvePsiTurn resolves exactly one target via resolveTargetActor; battleRound confirmPsi always routes to a single target-enemy/ally submenu. EB battle_action_table shows Rockin α/β target: all, Fire α target: row, Freeze target: one — the converter emits no target field for player PSI. Party-side multi-target exists nowhere (enemy actions do support target 3/4 = all).
- **EB parity note:** EB PK Fire hits a row and Rockin/Starstorm hit all enemies; Freeze/Lifeup α are single-target. Confirmed from local battle_action_table.yml. Relevant to Act-1 duo (Paula's Fire vs single-target Freeze choice loses meaning).
- **recommendation:** Emit target from psi_ability_table→battle_action join and add a multi-target branch to resolvePsiTurn mirroring targetActorsForEnemyAction.

### F50 · Enemy AI is deterministic round-robin over action slots instead of EB's random selection

- **status:** DIVERGES · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:853`, `apps/game/src/battleLogic.ts:890`
- **evidence:** selectEnemyAction picks actions[cursor % length] and nextActionIndex increments monotonically — every enemy's move sequence is fully predictable (slot 1,2,3,4,1,...). The doc comment explicitly states it matches 'source table order without inferring hidden ROM weighting'.
- **EB parity note:** EB picks among the 4 action slots randomly each turn (duplicated slots = weighting), which is why tables duplicate entries. High confidence. Predictability is exploitable (e.g. Coil Snake's 4th-slot special lands exactly every 4th round).
- **recommendation:** Pick a uniformly random slot per turn with the battle rng (duplicates preserve EB weighting for free); keep round-robin only if determinism is wanted for tests via injected rng.

### F51 · Encounter sector event flag acts as an on/off gate; EB uses it to select between sub-group 1 and 2

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** medium
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/overworldEnemies.ts:19`, `apps/game/src/encounterLogic.ts:40`, `packages/eb-converter/src/encounters.ts:198`
- **evidence:** rollEncounter/selectSectorEnemyGroup return null when sector.eventFlag>0 and the numeric flag is unset (264 of 861 populated encounter sectors carry a flag, e.g. Onett flag 132), and when the flag IS set both sub-groups are rolled in list order. So flagged sectors are encounter-dead pre-flag and mix both pools post-flag.
- **EB parity note:** In EB map_enemy_groups the Event Flag chooses WHICH sub-group spawns (story-phase swap: e.g. Onett day/post-Frank rosters), it does not disable encounters. Confident it is a selector; not fully certain which sub-group corresponds to flag-set (would verify against EB docs/ROM before fixing).
- **recommendation:** Change rollEncounter to pick sub-group index by flag state (verify polarity against EB behavior first) instead of gating; numeric flags are settable via eventHost so the story swap can work.

### F52 · Overworld roaming enemies never chase the player and never flee when outmatched

- **status:** MISSING · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/chunkedWorldScene.ts:4611`, `packages/eb-converter/src/battle.ts:146`
- **evidence:** stepOverworldEnemies drives roamers with stepNpc (random NPC wander); there is no player-seek vector and no flee state. enemy_groups.yml carries 'Fear mode: run away if flag is unset' + 'Fear event flag' per group, which the converter does not emit. The instantWin advantage exists but strong-party enemies still amble toward you randomly.
- **EB parity note:** EB on-map enemies actively pursue the player when in range, and run away (green-swirl trivial fights) once the group's fear flag is set or the party vastly outlevels them. High confidence.
- **recommendation:** Add a simple pursue-within-radius behavior to roamers and a flee mode driven by computeEncounterAdvantage()==='instantWin' (approximating fear flags), which pairs naturally with the existing green/red swirl work.

### F53 · Single generic 50% shield replaces EB's physical/PSI shield split and reflect variants

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/statusEffects.ts:149`, `content/psi-overrides.json`
- **evidence:** incomingDamageScale applies one 'shielded' multiplier (default 50%) to ALL incoming damage; psi-overrides gives psi 31-38 (both Shield and PSI Shield families) the identical {shielded, 50, 3 turns} effect. No reflect (β/Ω counter) exists; battle-status-effects memory already lists reflect/AoE as deferred.
- **EB parity note:** EB Shield halves physical only, PSI Shield halves PSI only, and the β/Ω versions reflect the damage back; Titanic Ant famously punishes offensive PSI via its PSI Shield. High confidence on EB behavior.
- **recommendation:** Split the ailment into physicalShield/psiShield magnitudes and tag damage sources (physical vs psi) in applyDamage; add reflect later. Medium Act-1 impact since the boss's shield is currently a stubbed action anyway (see enemy-action findings).

### F54 · Status ailment roster is a 5-entry subset and sleep/confusion persist onto the field after battle

- **status:** ROUGH · **severity:** low · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/statusEffects.ts:13`, `apps/game/src/battleScene.ts:3456`
- **evidence:** StatusAilment = poisoned|paralyzed|asleep|confused|shielded. EB's mushroomized, diamondized, cold, sunstroke, homesick, possessed and the feeling-strange/cry distinction have no representation. buildPostBattlePartySnapshot copies ALL surviving statuses (including asleep/confused/shielded) into field party state; hospital fullRecover({cureStatuses:true}) clears everything (verified at chunkedWorldScene.ts:2895).
- **EB parity note:** EB persists poison/cold/sunstroke/mushroom/diamond outside battle but clears sleep and feeling-strange when the fight ends; homesickness is a Ness-specific field mechanic. The 5-ailment set is a documented authored decision (hybrid: faithful heals, authored status), so breadth is a creative call — the post-battle persistence of sleep/confusion is a genuine small bug within that design.
- **recommendation:** Filter battle-only ailments (asleep, confused, shielded) out of the post-battle snapshot; treat the missing EB ailments (esp. homesick, mushroomized) as a design decision for later acts.

### F55 · Enemies ignore PP — PSI-using enemies cast forever

- **status:** DIVERGES · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleLogic.ts:385`, `apps/game/src/battleLogic.ts:874`
- **evidence:** buildEnemyCombatant hardcodes maxPp: 0, pp: 0 and resolveEnemyActionTurn never charges PP; EB data has real pools (Black Antoid PP 25 with a 5-PP Lifeup — 5 casts max in EB). The converter does not emit the enemy PP field from enemy_configuration_table.yml.
- **EB parity note:** EB enemies have PP and fall back to other actions when dry. Confirmed from enemy_configuration_table.yml (PP field present). Low impact while enemy psi is stubbed as damage, but becomes relevant once findings 2/3 are fixed.
- **recommendation:** Emit PP from the converter and charge battle_action PP Cost when a psi-type enemy action resolves; skip/fallback when insufficient.

### F56 · Residual item-effect gap is now only 6 consumables, none Act-1-reachable (the '53 consumables' gap is closed)

- **status:** EXISTS · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `content/item-overrides.json`, `apps/game/src/partyState.ts:914`
- **evidence:** Replicating decodeItemUseEffect over items.json + item-overrides.json: 89 of 95 consumables decode to an effect; the 6 without: Rock candy (101), Chick (168), Chicken (169), Suporma (204), Lucky sandwich (228, 231). Cross-referenced all 66 generated shops: none of the 6 are sold anywhere. In battle they resolve as blockedReason 'unknownEffect' (skipped turn, item kept).
- **EB parity note:** Rock candy is a permanent +1 random-stat capsule in EB (the permStat kind already exists for the other capsules); Chick→Chicken is a grow-and-sell gimmick; Suporma is a joke item; Lucky sandwich gives a random small buff. Low player impact — none obtainable in Act 1 shops.
- **recommendation:** Give Rock candy a permStat effect via item-overrides for parity; leave the rest until their acts. Also update the stale MORNING/memory claim of '53 consumables without effects'.

### F57 · Two-phase round pipeline, run/guard priority, advantage swirls, instant win, unescapable Act-1 bosses, rewards and level-ups all verified working

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified (verifier not run)
- **files:** `apps/game/src/battleRound.ts:263`, `apps/game/src/battleScene.ts:833`, `apps/game/src/chunkedWorldScene.ts:4820`, `content/battle-rules.json:3`, `apps/game/src/characterModel.ts:169`
- **evidence:** Live probe (battle group 3): phase command-input → target submenu → execution with EB-style message window ('Bosch's attack! / Signal Stutter took 17 HP of damage!') → enemy turn → next round; rolling HP odometer active (hpDisplayed vs hpTarget). Code: run resolves at round start with EB's exact formula ((partySpd−enemySpd+10·round)/100, battleRound.ts:313), Guard applies as round-start stance and halves damage, enemies win speed ties (roundSideTieRank), touchAdvantage gives back-attack first strikes both ways, computeEncounterAdvantage → overworld instant win with full applyVictoryRewards (chunkedWorldScene.ts:4846,4942), unescapableGroups [36,448,450] cover all three authored Act-1 boss gates per content/triggers.json, drop rates preserve EB n/128 rarities, level-up growth is the EB algorithm (HP target vit×15, PP iq×5, growth·(L−1) gap formula) with deterministic midpoint rolls instead of EB's random 0–9 roll, and mortal-wound settle lets rolling HP survive a technically-lethal hit (EB odometer parity).
- **EB parity note:** These match EB behavior closely; the deterministic level-up roll (no stat variance) and the ±50% speed jitter in jitteredTurnOrder are mild approximations of EB's randomness. The command sets per character (Ness Bash/Goods/Auto/PSI, Paula +Pray, Jeff Spy, Poo Mirror) match EB's layout; Pray/Mirror/Spy are self-described bounded approximations relevant only in later acts.
- **recommendation:** No action required; noting as confirmed foundation so other findings are read as gaps in an otherwise-working system.



---

# Round 2 — missing dimensions (run after Tracks A+B landed, branch fix/audit-sweep)

The UX, map, and parity-sweep auditors ran once the spend limit was raised, against the tree WITH the Track A/B fixes. 10 agents, adversarial verification on critical/high findings.

## Round-2 priority tables

### P0

| id | dim | status | class | finding | verdict |
|---|---|---|---|---|---|
| F58 | ux | MISSING | fix-candidate | 42 of 45 shop clerks never open the Buy/Sell menu — custom-dialogue overrides silently drop the CCS shop event | CONFIRMED |
| F75 | parity-sweep | MISSING | fix-candidate | No game-over flow: party wipe returns a 0-HP party to the overworld with no respawn, revival, or money penalty | CONFIRMED |

### P1

| id | dim | status | class | finding | verdict |
|---|---|---|---|---|---|
| F59 | ux | MISSING | fix-candidate | Service NPC coverage is near-zero for the same reason: only 1 hotel, 1 phone, 2 hospital entries exist world-wide | CONFIRMED |
| F68 | map | ROUGH | fix-candidate | Six authored collision-override rects solidify warp-reachable rooms/decks, corrupting 8 door landings (verified in-engine) | CONFIRMED |
| F69 | map | ROUGH | fix-candidate | Dead door: cave floor-hole warp permanently aborts — destination is solid in base converted data (verified in-engine) | CONFIRMED |
| F76 | parity-sweep | DIVERGES | fix-candidate | Battle winnings are paid straight into the wallet ('You got $X') instead of Dad depositing to the ATM bank account | CONFIRMED |
| F77 | parity-sweep | DIVERGES | fix-candidate | Victory EXP is granted in full to every living member instead of being divided among conscious party members | CONFIRMED |

### P2

| id | dim | status | class | finding | verdict |
|---|---|---|---|---|---|
| F60 | ux | ROUGH | fix-candidate | Buy list shows no visible cursor when rows are disabled — with 0 money the selection indicator vanishes entirely | unverified |
| F70 | map | ROUGH | fix-candidate | Chunk-seam foreground-occlusion loss: bottom tile row of every 16-tile chunk cannot see its south neighbor — 2421 tiles lose promotion, 1093 player-visible | unverified |
| F78 | parity-sweep | DIVERGES | fix-candidate | Encounter swirl is a rainbow hue-cycling spiral with no green/red advantage color signaling | unverified |
| F79 | parity-sweep | DIVERGES | fix-candidate | Diagonal movement renders cardinal facing only and moves at normalized (0.707/axis) speed; EB uses 8-direction sprites and full per-axis speed | unverified |
| F80 | parity-sweep | MISSING | fix-candidate | No inventory capacity: give() and shop buying push unbounded items (EB caps at 14 slots/character incl. equipment) | unverified |
| F81 | parity-sweep | ROUGH | fix-candidate | Enemy assist/status battle actions: only 4 of ~318 EB battle actions have authored effects; the rest of the assist-type actions silently no-op | unverified |
| F82 | parity-sweep | DIVERGES | needs-creative-call | Interior camera zooms up to 3.5x (variable, non-integer) — EB never changes pixel scale | unverified |

### P3

| id | dim | status | class | finding | verdict |
|---|---|---|---|---|---|
| F61 | ux | MISSING | fix-candidate | Denied actions share the cancel SFX — no distinct 'denied' cue exists in the menu SFX vocabulary | unverified |
| F62 | ux | EXISTS | intentional-divergence | Overworld pause menu structure and empty states are solid and EB-faithful | unverified |
| F63 | ux | EXISTS | fix-candidate | Battle UX core loop verified: EB-correct presentation, clean exit, but victory tally frames unobserved | unverified |
| F64 | ux | ROUGH | needs-creative-call | Dialogue system: typewriter, prompt arrow, and paging all work; window chrome has polish nits | unverified |
| F65 | ux | EXISTS | intentional-divergence | Overworld HUD verified good: readable vitals, hides during menus/dialogue, status ailments wired; heartbeat/badge visuals unconfirmed | unverified |
| F66 | ux | ROUGH | needs-creative-call | New-game spawn drops the player face-to-face with a sign, so the very first Z press after the intro reads a NOTICE instead of advancing play | unverified |
| F67 | ux | ROUGH | fix-candidate | Minor cursor-render inconsistency: Status char-select shows the inverted pill without the ▶ arrow that Goods/PSI/Equip show | unverified |
| F71 | map | EXISTS | intentional-divergence | Roof-walking override coverage is complete: zero residual roof pockets beyond the 2 intentionally-excluded terrain FPs; overrides confirmed live in-engine | unverified |
| F72 | map | EXISTS | intentional-divergence | Interior sector clipping consistent: every indoor sector is bounded (0 indoor-but-unbounded of 2560) | unverified |
| F73 | map | ROUGH | fix-candidate | Sign-stamp and building-override assets fully present; one sign region overruns its chunk edge by 3px | unverified |
| F74 | map | EXISTS | intentional-divergence | Door trigger feel: distance-0 leading-edge trigger fires promptly at the door (spot-checked) | unverified |
| F83 | parity-sweep | DIVERGES | needs-creative-call | X-cancel skip-to-end works on ALL dialogue including one-shot scripted beats — EB has no dialogue cancel at all | unverified |
| F84 | parity-sweep | DIVERGES | needs-creative-call | Unflagged non-EB conveniences: P-key save-anywhere and the always-visible helper prompt bar | unverified |
| F85 | parity-sweep | MISSING | needs-creative-call | Phone system lacks the EB Dad/Mom mechanics: no homesickness, no Dad level-progress commentary | unverified |
| F86 | parity-sweep | ROUGH | fix-candidate | Minor field/battle presentation trivia (grouped): ATM fixed denominations vs EB digit entry; battle command grid order differs from EB; hotel/hospital lack EB presentation beats; victory money line phrasing | unverified |
| F87 | parity-sweep | EXISTS | intentional-divergence | CONFIRMED parity wins on this branch (positive verification): formation amounts, duplicate lettering, text blips, turn-to-face, mortal-wound rolling HP, enemy dissolve, sold-out shops, field poison, static enemy sprites, single walk speed, native viewport | unverified |

## Round-2 full detail

### Dimension: ux

**Coverage:** Examined in-engine via 10 headless probe runs at native 512x448 (@3x screenshots, Read and visually inspected ~14 frames): overworld pause menu root + Goods/PSI/Equip/Check/Status char-select layers with cancel unwinding and menuSfx counts; empty-inventory states; shop flow at two Onett drugstore clerks (NPC 9 broken, NPC 404 working: root Buy/Sell/Cancel, buy list, zero-money denial); sign reading + typewriter pacing + page-prompt arrow + multi-page advance; overworld HUD (vitals bars, poison status in HUD model, hide-during-menus behavior); full battle vs group 3 (command grid both actors, BASH target select, PSI submenu with PP cost, execution message, clean exit to overworld). Static code verification: menu SFX cue vocabulary, danger-heartbeat plumbing, equip stat-delta preview code, service/ATM/phone-storage menu models, eventRunner override semantics, custom-dialogue.json service/shop key counts. NOT examined (honest gaps): hospital/hotel/phone/ATM service UIs in-engine (only 4 authored service NPCs exist world-wide and none were near probe spawns; menu models verified in code only); sell-with-items, successful buy + equip-on-buy prompt, full-inventory on buy/present, dead-party-member menu states (no way to grant money/items via debug hooks within budget); victory tally / level-up page visuals (flow confirmed, frames missed); PSI greying at insufficient PP; Status DETAIL page visuals (probe misfired twice on multi-page sign dialogue); Goods Use/Give/Drop execution; danger heartbeat audio; Track Lab panel occlusion (never appeared in probe screenshots).

#### F58 · 42 of 45 shop clerks never open the Buy/Sell menu — custom-dialogue overrides silently drop the CCS shop event

- **status:** MISSING · **severity:** critical · **class:** fix-candidate · **confidence:** high
- **verdict:** CONFIRMED — Static trace fully confirms the finding. (1) eventRunner.ts:176 skips the CCS reference event whenever a byNpcId custom-dialogue entry exists, and interactionEntryEvents (line 72) only emits a shop event when the entry has a `shop` key. (2) The live scene (chunkedWorldScene.ts:3477) uses this exact interactionEvents; startInteractionDialogue only launches the CCS RuntimeEventSequence for reference events, and eventHost.ts:406 (openShop) is how non-overridden clerks open shops — so dropping the reference drops the shop. (3) Independent recount of scripts/.shop-clerks.json (45 clerks) vs content
- **verifier notes:** Recommended fix direction (merge behavior events extracted from the replaced CCS event, keep custom pages) preserves the intentional Swagbound dialogue-voice divergence while restoring EB commerce — the merge approach is strictly better than hand-adding 42 shop keys, since it also fixes any service/heal/save clerks overridden the same way. The 3 working clerks (404/33/749) prove the entry.shop path works, so a data-only fix (add shop keys from mine-shop-clerks.mjs output) is a valid quick patch.
- **files:** `apps/game/src/eventRunner.ts`, `content/custom-dialogue.json`, `scripts/.shop-clerks.json`
- **evidence:** In-engine: talked to Onett drugstore clerk NPC 9 (spawn 7872,1516, walk to counter); across ~9 Z presses the two custom pages ('What can I do for you, the real one?' / 'In, in. Wipe whatever followed you off the mat.') loop and menuRenderStack stays [] — no shop menu ever opens. Root cause: eventRunner.ts interactionEvents (lines ~152-178) — when a byNpcId custom-dialogue entry exists, the CCS reference event is skipped entirely (`...(customEntry ? [] : [{kind:'dialogue',reference}])`), so the shop only survives if the entry itself has a `shop` key (interactionEntryEvents line 72). Data: of the 45 clerk targets in scripts/.shop-clerks.json, only NPCs 404/33/749 have `shop` in their override; the other 42 (stores 1,2,5-30,34-45,56,57,60-63) have pages-only entries. Control test: clerk NPC 404 (same store 1) DOES open Shop→Buy/Sell — confirming the mechanism, not the shop system, is broken.
- **EB parity note:** EB towns are built around drugstore/bakery/etc. commerce; with wallet earned from battles but almost no working shops, the EB economy loop (fight → cash → gear) is severed game-wide.
- **recommendation:** Either add the `shop` key to the 42 clerk overrides (mine-shop-clerks.mjs already produces the npcId→storeId map), or better: change interactionEvents to merge behavior events (shop/service/heal/save) extracted from the replaced CCS event even when custom pages override the text.

#### F59 · Service NPC coverage is near-zero for the same reason: only 1 hotel, 1 phone, 2 hospital entries exist world-wide

- **status:** MISSING · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** CONFIRMED — Every evidence claim verified in the current checkout, and I reproduced the gap quantitatively with an in-repo mining script. (1) content/custom-dialogue.json byNpcId has exactly 332 entries with exactly 4 service keys (58:hotel, 60:phone, 111:hospital, 115:hospital) and zero save/heal keys. (2) eventRunner.ts interactionEvents (lines 152-179) confirms the replacement path: when a custom entry exists, events come solely from the entry (service/heal/save/shop keys); the CCS reference dialogue — whose resolved script effects are the only other way services execute — is dropped. (3) I ran resolve
- **verifier notes:** Nuance the fixer should know: the "same merge fix as shops" (merging CCS effects into overridden NPC events) only repairs the 3 override-broken healers. The 6 dead hotels, the ATM, and missing phones are UNVOICED NPCs whose CCS scripts resolve to undecoded raw control codes ([1F ..] special routines) — no amount of override-merging recovers them; they need authored `service` keys (the NPC-58 pattern) or new CCS decodes. The recommended mining script is the right approach; my verification mining logic (resolveScriptEvents over every interactable NPC's textPointer, pattern-match "one night stay will cost" / heal_percent effects) reproduces the full list: hotels 58(wired)/256/483/890/1020/1124, ATM 1375, broken healers 622/752/1292. Also note eventHost.ts already has an openAtm hook wired to the built ATM menu — it just never fires because no script decodes to an `atm` effect.
- **files:** `content/custom-dialogue.json`, `apps/game/src/eventRunner.ts`, `apps/game/src/menuModel.ts`
- **evidence:** content/custom-dialogue.json byNpcId (332 entries) contains exactly 4 `service` keys: hotel x1, phone x1, hospital x2, plus 0 `save`/`heal` keys. The hotel/hospital/phone/ATM menu models are fully built (menuModel.ts: HOSPITAL/HOTEL/PHONE_SERVICE_MENU_IDs, phone storage deposit/withdraw screens, ATM_AMOUNT_OPTIONS) but voiced service NPCs whose overrides lack the key lose their CCS heal/save behavior via the same eventRunner replacement path as the shops finding. I could not reach any of the 4 working service NPCs within probe budget, so the service menu UIs themselves are code-verified only.
- **EB parity note:** EB has a hotel, hospital, phone and ATM in every town; resting/saving/banking are core loop verbs. Four service points across the whole world map is a large completeness gap versus EB structure.
- **recommendation:** Same merge fix as the shops finding, plus an audit script (like mine-shop-clerks.mjs) that mines CCS events for heal/save/hotel/ATM actions and cross-checks against overrides; then an in-engine pass on each service menu.

#### F60 · Buy list shows no visible cursor when rows are disabled — with 0 money the selection indicator vanishes entirely

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/uiScene.ts`, `apps/game/src/menuModel.ts`
- **evidence:** Screenshot shop4-03: Buy panel lists 'Practice Bat 18 NO CASH' etc. with no highlight/pill/arrow on any row, while the debug render stack shows item 0 as selected:true, enabled:false. The selected-row inverted-pill treatment is only rendered for enabled items, so an all-unaffordable list (the normal early-game state at wallet 0) gives zero feedback about where the cursor is; pressing Z plays menuCancel with no visual response. Confirmed across two frames of the same run.
- **EB parity note:** EB always shows the cursor arrow in shop lists regardless of affordability, and the clerk verbally refuses ('you don't have enough money'). Here the denial is a bare cancel blip with an invisible cursor.
- **recommendation:** Render selected+disabled rows with a visible cursor (outline pill or arrow with greyed text), and consider a one-line refusal message on denied buy.

#### F61 · Denied actions share the cancel SFX — no distinct 'denied' cue exists in the menu SFX vocabulary

- **status:** MISSING · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/chunkedWorldScene.ts`, `apps/game/src/battleSfxPlan.ts`
- **evidence:** chunkedWorldScene.ts:444 — `type MenuSfxCue = Extract<BattleSfxCue, "menuMove" | "menuConfirm" | "menuCancel">`. In-engine, attempting to buy with 0 money logged menuCancel (shop4 run: sfx calls [menuConfirm, menuCancel] on the buy attempt). Move/confirm/cancel coverage is otherwise complete (20+ cue calls logged across the full menu tour).
- **EB parity note:** EB uses a distinct error buzzer for refused actions vs the back-out sound; conflating them loses a small but real feedback channel.
- **recommendation:** Add a `menuDenied` cue to the SFX plan and route disabled-item confirms and refused purchases through it.

#### F62 · Overworld pause menu structure and empty states are solid and EB-faithful

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/menuModel.ts`, `apps/game/src/uiScene.ts`
- **evidence:** Verified in-engine at native res: root menu is exactly EB's six commands (Talk/Goods/PSI/Equip/Check/Status — menuModel.ts:334-342 documents the parity intent); each submenu opens a char-select panel (Bosch/Cloak); Equip shows Weapon/Body/Arms/Other slots; empty-inventory states read 'Bosch has no goods.' and 'No goods to check.' instead of dead-ending; X unwinds exactly one level per press with menuCancel cue (verified via render-stack traces unwinding shop-1-buy → shop-1 → closed). Equip stat-delta preview code exists (menuModel.ts:1393-1399 equipDeltaLabel 'Off +x Def +y' on picker rows) but was not visually verified (empty inventory).
- **EB parity note:** Menu STRUCTURE matches EB; the rounded dark Pixelify Sans look is the approved custom design language.
- **recommendation:** None — recording as a verified-good baseline. Visual pass on the equip picker with items in inventory still worth doing once item-granting is possible.

#### F63 · Battle UX core loop verified: EB-correct presentation, clean exit, but victory tally frames unobserved

- **status:** EXISTS · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/battleScene.ts`
- **evidence:** ?battle=3&party=2&psi=all run: first-person battle (no party sprites), static Swagbound enemy sprite with white target arrow, 3x2 command grid (Bash/Goods/Auto over PSI/Defend/Run) with inverted-pill cursor, per-actor banner (Bosch then Cloak, whose grid adds Pray), two-phase rounds confirmed in debug (all commands collected, then phase=execution), PSI submenu shows 'Cold Memo 4' + 'To enemies / PP Cost: 4' info box, execution window uses exact EB phrasing ("Bosch's attack!\nSignal Stutter took 16 HP of damage!"), and battle exits to overworld with no softlock. Gap: the victory/level-up summary pages (battleScene.ts victorySummaryPageIndex_ machinery) flew by between presses — readability/pacing of the tally is unverified.
- **EB parity note:** Everything observed matches EB battle presentation doctrine (first-person, static enemies, two-phase rounds, rolling HP boxes). 'Auto' is a Swagbound addition already in the design spec.
- **recommendation:** One targeted probe on victory pages (fight with advantage, screenshot each z-press through the tally) to confirm exp/money/level-up text pacing and legibility.

#### F64 · Dialogue system: typewriter, prompt arrow, and paging all work; window chrome has polish nits

- **status:** ROUGH · **severity:** low · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/dialogueRenderer.ts`, `apps/game/src/uiScene.ts`
- **evidence:** Verified: 45cps typewriter (DEFAULT_TEXT_SPEED_CPS, dialogueRenderer.ts:5) shows partial text mid-page ('NOTICE: The route' frame), completed pages show a ▼ advance arrow at the window's right edge, multi-page signs advance on Z, dialogue is top-anchored like EB. Nits seen at native res: (1) the window is a fixed ~4-line-tall box even for 1 line, with the 'Z: finish | X: close' helper floating mid-window at the right — reads as unfinished layout; (2) in the Pixelify pixel font the helper text is genuinely hard to parse at 512x448 ('finish' reads like 'Anish', digit 5 reads as S so HP '75/75' scans as '7S/7S' in HUD panels); (3) X instantly closes multi-page dialogue mid-stream (labelled behavior, but EB's B-button never discards unread story text).
- **EB parity note:** Pacing and flow match EB; the fixed-size window itself is EB-like. The helper-hint placement and glyph ambiguity are artifacts of the custom UI language, hence creative call.
- **recommendation:** Consider corner-anchoring or fading the Z/X helper, and test digit glyphs (5 vs S) at native res; decide whether X-close should require the page to be fully revealed first.

#### F65 · Overworld HUD verified good: readable vitals, hides during menus/dialogue, status ailments wired; heartbeat/badge visuals unconfirmed

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** medium
- **verdict:** unverified
- **files:** `apps/game/src/overworldStatusHud.ts`, `apps/game/src/chunkedWorldScene.ts`, `apps/game/src/audio/transitionSfx.ts`
- **evidence:** Screenshots show two bottom-anchored panels (name, HP x/x with green bar, PP x/x with blue bar) occupying roughly the bottom sixth; they hide while any menu or dialogue is open, so they never fight the text windows, and 'M: Menu' hint sits bottom-right. __setPartyStatus(0,'poisoned') immediately surfaced {ailment:'poisoned'} in the HUD debug model, and the danger plumbing exists end-to-end (isDangerHp per member, dangerActive aggregate, dangerHeartbeat SFX on LOW_HP_DANGER_BEEP_INTERVAL_MS — chunkedWorldScene.ts:544,3114-3119; transitionSfx.ts:12-13 documents the EB double-thump). Not visually confirmed: the on-panel poison badge rendering (HUD was hidden behind an open dialogue in the poison run) and the audible heartbeat.
- **EB parity note:** EB has no overworld HUD at all — this is the approved Swagbound addition; the audit checked it for occlusion/readability, both fine. One real occlusion note: in tight interiors (drugstore) the panels cover the lower walkway and can hide the follower sprite standing there.
- **recommendation:** Quick visual check of the ailment badge and one low-HP walk to hear the heartbeat; optionally fade panels when the player walks behind them.

#### F66 · New-game spawn drops the player face-to-face with a sign, so the very first Z press after the intro reads a NOTICE instead of advancing play

- **status:** ROUGH · **severity:** low · **class:** needs-creative-call · **confidence:** medium
- **verdict:** unverified
- **files:** `content/overworld-interactables.json`, `apps/game/src/chunkedWorldScene.ts`
- **evidence:** Debug across three runs: at spawn (2112,1768, facing down) nearestInteractable is sign 'signal-spawn-notice' at (2112,1788), distance 20 — inside talk range. Players (and my probe, repeatedly) mashing Z through the opening narration immediately trigger the sign, and its 2-page text re-opens on every stray Z, which also blocks the M menu (menu can't open while dialogue is up). This cost three probe runs before I routed around it; a player buffering confirms through the intro will hit the same thing.
- **EB parity note:** EB's opening (Ness's bedroom) has nothing interactable directly in the walk path of the first confirm press.
- **recommendation:** Nudge the spawn point or the sign a tile apart, or suppress interactables for a beat after scripted dialogue closes.

#### F67 · Minor cursor-render inconsistency: Status char-select shows the inverted pill without the ▶ arrow that Goods/PSI/Equip show

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** medium
- **verdict:** unverified
- **files:** `apps/game/src/uiScene.ts`
- **evidence:** Screenshot menu4-09 (Status submenu): 'Bosch' row has the white pill but no ▶ cursor triangle; menu4-05 (PSI submenu) and menu4-03 (Goods submenu) both show ▶ + pill on the same kind of row. Same selected:true state in the render stack, different chrome.
- **EB parity note:** Cosmetic consistency within the custom UI language; no EB equivalent at stake.
- **recommendation:** Unify the selected-row treatment across all char-select screens.

### Dimension: map

**Coverage:** EXAMINED: (1) full-map residual roof-pocket scan — re-implemented the gen-collision-overrides.mjs sandwich heuristic (MAXW=90/MAXH=70/MINFILL=0.3) over world.json with the 214 authored rects applied; (2) all 1164 doors checked for solid/OOB destination cells on both base and override-applied grids, plus ring-search emulation of resolveDoorWarpLanding (maxRingCells=8, 13x6 foot box); (3) override-rect vs door-endpoint conflicts (exact-cell and 32px slop); (4) sector indoor/bounded consistency (all 2560 sectors); (5) chunk-seam foreground-occlusion loss quantified from surfaceRows (isOccluderTile semantics, FOREGROUND_SOLID_BELOW_THRESHOLD=8) against composeRegion's chunk-local bounds; (6) sign-overrides (44 signs), building-overrides (41 images), tile-overrides (empty) file/bounds integrity; (7) seven in-engine probes at 512x448: dead-door walk-up (console-confirmed warp abort), door#440 warp-through (landing displacement + screenshot), void-landing movement test, override-pocket pin test (proving collision-overrides are live), chunk-seam visual at an Onett stop sign, plus flood-fill of a flag-gated door landing region. NOT EXAMINED: doors with non-zero but sub-8-ring landing displacement on BASE data (only exact-solid destinations flagged); ladder/rope/escalator/stairway trigger behavior specifically; visual correctness of all 44 stamped signs (file existence + bounds only); in-engine interior render-clipping (data-level only — 0 indoor-unbounded sectors); the legacy worldScene.ts (out of scope per orientation); walking every town for seam artifacts (one spot probed); exact EB place-name identification of the dead door chain (evidence is coordinate/data-based, naming is medium confidence); no tsc or test runs (not needed for this dimension).

#### F68 · Six authored collision-override rects solidify warp-reachable rooms/decks, corrupting 8 door landings (verified in-engine)

- **status:** ROUGH · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** CONFIRMED — Independently reproduced every factual claim. (1) Re-ran the door-destination scan: exactly 8 of 1164 doors in apps/game/public/generated/world.json have destinationWorldPixel inside an authored rect in content/collision-overrides.json (214 solids, identical to the generated copy), with door indices, coordinates, and rect notes matching the finding cell-for-cell (#109/#110, #227, #440, #800, #918, #937/#938), plus the one source-cell hit (door #1053 at 3656,9640 in sector2382 roof 7/14). (2) Verified the base collision grid is passable at all 8 destinations — the authored override is the sole 
- **verifier notes:** Recommendation moves TOWARD EB parity: it preserves the (EB-faithful) roof-solidification sweep and only removes the 7 warp-destination false-positive rects. Adding a doors[] cross-check to gen-collision-overrides.mjs is the right structural fix. Minor caution for the fixer: prefer trimming rects to just exclude the destination cells (plus a landing footprint margin) where a rect legitimately covers real roof; wholesale removal of e.g. sector2382 rects could re-enable some roof-walking. Also handle the door #1053 SOURCE cell (3656,9640) covered by sector2382 roof 7/14. Severity high is calibrated: verified wrong-ledge landing in-engine (door #440, Fourside), unstandable intended decks, one landing at ring-search limit; not critical since Act 1 appears unaffected and no confirmed soft-lock.
- **files:** `content/collision-overrides.json`, `scripts/gen-collision-overrides.mjs`, `apps/game/src/chunkedWorldScene.ts`, `apps/game/src/doorTriggers.ts`
- **evidence:** Script scan: 8 of 1164 doors have destinationWorldPixel inside an authored rect (base grid passable): doors #109/#110 dest (1576,1672) in 'sector389 roof 12/16'; #227 dest (3480,9632) in 'sector2413 roof 1/1'; #440 dest (3456,3784) in 'sector941 roof 1/2'; #800 dest (3680,9632) in 'sector2382 roof 5/14'; #918 dest (3656,9648) in 'sector2382 roof 10/14'; #937/#938 dest (4176,6432) in 'sector1584 roof 12/14'. One door SOURCE cell (3656,9640) is covered by 'sector2382 roof 7/14'. Ring emulation shows landings displaced 2-8 cells (16-64px; #109 worst at ring 8). IN-ENGINE: walked door #440 from spawn (5384,4182) — player warped to (3456,3760), 24-32px off the intended (3456,3784→3792) landing, onto an adjacent ledge of a Fourside tower (screenshot shows player on a skyscraper ledge above a 'HELI' door); the intended arrival deck is now solid/unstandable. Root cause: the sandwich heuristic in gen-collision-overrides.mjs detects geometric enclosure only — rooms/decks reachable ONLY via door warp look identical to unreachable roof pockets, and the sweep never cross-checked world.json doors[].
- **EB parity note:** In EB these are legitimately walkable spots the player is warped onto (e.g. the Fourside tower ledge/heliport deck); solidifying them moves AWAY from EB. The roof-solidification goal itself is EB-faithful — only these warp-destination pockets are false positives.
- **recommendation:** Regenerate/prune the override list excluding any pocket that contains a door destinationWorldPixel or worldPixel (add a doors[] cross-check to gen-collision-overrides.mjs, ~10 lines); concretely remove/trim the 7 rects named above and rebuild. Keep the rest — the sweep is otherwise clean.

#### F69 · Dead door: cave floor-hole warp permanently aborts — destination is solid in base converted data (verified in-engine)

- **status:** ROUGH · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** CONFIRMED — Every load-bearing claim checks out statically in the current checkout. world.json doors[477]/[478] are at (6440,4808)/(6448,4808) targeting (3192,1152) with style 33; the collision grid (cellSize 8) at cell (399,144) is solid=1 with surface byte 0x80, and the nearest passable cell is (398,126) at ring 18 — outside chunkedWorldScene.ts:5402's maxRingCells:8 — so applyDoorWarp (line 2282-2286) deterministically hits the abort at line 2504 with the exact logged message; no probe needed. The EB source data matches (map_doors.yml lines 6275-6292, two doors Destination X:399 Y:144), confirming pre-
- **verifier notes:** Recommendation is parity-positive overall, but one listed option (raise maxRingCells) would snap to (3184,1008), a room EB never warps you to from this hole — the EB landing is warp table entry 59 → pixel (2864,3080), walkable in converted data. The script pattern (hide party, music change, long pause, flag sets, warp) is consistent with a mandatory scripted drop (e.g., Lumine Hall→Lost Underworld style), supporting high severity; exact EB identity still not pinned, but the mechanism and dead-door impact are certain. Verified with zero probe runs — abort is deterministic from data + code.
- **files:** `apps/game/public/generated/world.json`, `packages/eb-converter/src/world.ts`, `apps/game/src/chunkedWorldScene.ts`
- **evidence:** Doors #477/#478 at (6440,4808)/(6448,4808) (EB map_doors.yml: Destination X:399 Y:144, style 33, a 2-cell floor hole) target (3192,1152), which is surface byte 0x80 (solid, not void) with the nearest passable cell 18 cells (144px) north — outside resolveDoorWarpLanding's 8-cell ring. IN-ENGINE: spawned at (6448,4830) in the cave interior (sector 1209, music context 'interior:30', screenshot shows the party standing in a floor hole), walked up into the hole: player pinned at y=4822.8 and console logged 'Door warp aborted: destination did not resolve to a walkable footprint.' This is PRE-EXISTING converter/base data, not caused by collision-overrides. The room is part of a door chain ((7360,3824)→pocket→dead hole onward), so the onward room at ~(3184,1008) plus anything behind it is unreachable.
- **EB parity note:** In EB this hole works — it is a real scripted drop. A door that silently does nothing diverges from EB and blocks whatever the chain leads to (later-act content; exact EB identity not pinned down, evidence is coordinate-based).
- **recommendation:** Investigate why the converted collision at (3192,1152) is solid (wrong sector collision, or the EB landing relies on script-side placement); either fix the converter's destination handling for this door style or raise maxRingCells for landings whose destination is deep-solid, or author a destination correction. Also scan for other base-data ABORT doors (this audit found exactly this one pair among 1164).

#### F70 · Chunk-seam foreground-occlusion loss: bottom tile row of every 16-tile chunk cannot see its south neighbor — 2421 tiles lose promotion, 1093 player-visible

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `packages/eb-converter/src/world.ts`
- **evidence:** composeRegion's solidCountAt returns 0 for ty+1 >= bounds.heightTiles (world.ts ~line 291-295), and buildFullWorld composes each 16x16-tile chunk with exact bounds and no south apron (~line 1157-1165). Quantified from world.json surfaceRows: of 40,355 solid tiles that satisfy isOccluderTile globally (selfSolid>0 && belowSolid>=8), 2,421 (6.0%) sit on a chunk bottom row and lose promotion; 1,093 of those have a passable cell within 24px above (player can visibly overlap). IN-ENGINE: at Onett seam spot (1304,1494) the player sprite draws over the top of a stop-sign prop it should be occluded by (screenshot mapaudit-7-seam.png) — visible but subtle at this spot.
- **EB parity note:** EB renders these walls/props over the actor everywhere; losing it in 32px bands along every 512px chunk seam is a converter artifact with no EB counterpart.
- **recommendation:** Compose each chunk with a 1-tile south apron (extend bounds.heightTiles by 1 for solid-count sampling only, still emitting 16 rows of pixels), or precompute tileSolidCount map-wide before the chunk loop and pass a global solidCountAt into composeRegion. Rebuild required.

#### F71 · Roof-walking override coverage is complete: zero residual roof pockets beyond the 2 intentionally-excluded terrain FPs; overrides confirmed live in-engine

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified
- **files:** `content/collision-overrides.json`, `apps/game/src/chunkedWorldScene.ts`
- **evidence:** Re-ran the sandwich heuristic map-wide with the 214 rects applied: exactly 3 residual candidates, all in the two documented terrain-FP sectors (225: two components at (320,896) and (456,896); 339: one at (5088,1360)) — the intentional exclusions. IN-ENGINE: spawned inside covered pocket (2700,352) (base grid passable '0', covered by rect 'sector73 roof 6/15'); after flushing the spawn dialogue, ArrowDown/Right/Up taps produced zero movement — applyCollisionOverrides (chunkedWorldScene.ts ~1536) is active in the live build. Caveat: the heuristic by design cannot see roofs that are open on one side, so 'zero residual' means zero within the heuristic's detection class.
- **EB parity note:** Roof cells are solid in EB; the authored-override mechanism restores parity (minus the 6 false-positive rects reported separately).
- **recommendation:** No action beyond the warp-destination pruning in finding 1. Keep the sector 225/339 exclusions.

#### F72 · Interior sector clipping consistent: every indoor sector is bounded (0 indoor-but-unbounded of 2560)

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** medium
- **verdict:** unverified
- **files:** `apps/game/public/generated/world.json`, `apps/game/src/roomBounds.ts`, `packages/eb-converter/src/world.ts`
- **evidence:** world.json sectors: 374 indoor, 1177 bounded (bounded = EB Setting != 'none', converter world.ts:547), 0 sectors with indoor=1 && bounded=0; all 1164 door destinations land in sectors satisfying that invariant. roomBounds.ts consumes areaIds+bounded for render clipping. Not re-verified visually in-engine this audit (prior verification per project memory).
- **EB parity note:** Matches the established render-bleed fix; no regression signal in data.
- **recommendation:** None.

#### F73 · Sign-stamp and building-override assets fully present; one sign region overruns its chunk edge by 3px

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `content/sign-overrides.json`, `content/building-overrides.json`, `content/tile-overrides.json`
- **evidence:** All 44 sign entries reference existing chunk PNGs (apps/game/public/generated/assets/world/chunks/background-*.png) and all 41 building-override images exist (apps/game/public/assets/buildings/*.png); 3 oversized signs correctly parked in needsReview; tile-overrides.json byTile is empty (nothing to break). One defect: sign 'THE PRECINCT' on chunk 3,3 has region x:461 w:54 → extends to x=515 past the 512px chunk edge, so its right 3px are clipped or need a second stamp on chunk 4,3.
- **EB parity note:** Sign reskins are an approved Swagbound divergence; this is an internal integrity nit, not a parity issue.
- **recommendation:** Trim or split THE PRECINCT's region across the chunk boundary in sign-overrides.json (or have stamp-signs.mjs warn on out-of-chunk regions).

#### F74 · Door trigger feel: distance-0 leading-edge trigger fires promptly at the door (spot-checked)

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** medium
- **verdict:** unverified
- **files:** `apps/game/src/doorTriggers.ts`
- **evidence:** adjacentProbeCells probes exactly 1 cell past the foot box leading edge (doorTriggers.ts, comment 'Intentionally tight so the warp fires at the door, not ~3 cells early'); in probe B a real walk-up from (5384,4182) into the door cell at (5384,4168) triggered the warp within one 600ms hold with no early-fire and no dead-zone. Only one door walked this audit; the broader 106/106-interior e2e coverage is per project memory, not re-run.
- **EB parity note:** Matches EB push-into-door behavior.
- **recommendation:** None.

### Dimension: parity-sweep

**Coverage:** Examined via code + local EB data + 6 headless in-engine probes (localhost:5173): overworld movement (playerController.ts, live speed measurement 112px/s), doors/warps (doorTriggers.ts, mapTransition.ts), dialogue (dialogueRenderer.ts, eventRunner.ts, text-blip SFX, X-cancel semantics verified in-engine with flag firing), NPC behavior (npcBehaviors.ts, turn-to-face), field systems (menuModel.ts ATM/hotel/hospital/phone/storage, partyState.ts inventory/bank/sell-price, field poison), progression (game-over path traced code+probe: forced loss vs group 409, party persisted at 0 HP), battle presentation (transitions.ts swirl, rolling meters, mortal wounds, enemy dissolve, victory tally/level-up pages), recent parity work spot-checks (formation amounts cross-checked against external/coilsnake-full/enemy_groups.yml groups 0/27/30/32 — match; A/B duplicate lettering; enemy-action-effects layer vs 318-entry battle_action_table.yml; sold-out shops; X-skip semantics). NOT examined: PSI battle animation parity, battle background distortion fidelity, ladder/rope/bike movement in-engine, stairs/escalator arrival positioning in-engine, run-away odds and Guts/SMAAASH rate formulas vs ROM, shop clerk dialogue flows end-to-end, save/load slot integrity, cutscene choreography fidelity, hotel/hospital presentation in-engine, exact EB walk-speed px/frame (not extractable from CoilSnake data — measured value 110px/s judged plausible), and the full overworld lose flow via a real roaming-enemy encounter (loss verified via ?battle= URL path only; the return-restore code path is unambiguous).

#### F75 · No game-over flow: party wipe returns a 0-HP party to the overworld with no respawn, revival, or money penalty

- **status:** MISSING · **severity:** critical · **class:** fix-candidate · **confidence:** high
- **verdict:** CONFIRMED — Every cited code claim verified in the current checkout: battleScene.ts handleBattleOutcome (1578) sets phase "lose" with only "The party fell." (2451); beginExitTransition (1672) skips mortal-wound settling exactly on lose; exitBattle (1717) ships buildPostBattlePartySnapshot carrying battle-end 0-HP members and unchanged wallet; chunkedWorldScene.applyReturnRestore (3365) restores that party verbatim at the pre-battle position, consulting restore.outcome only in applyStoryGateReturn (3353) for gate suppression. Repo-wide search confirms no revive/respawn/game-over flow exists (only battle re
- **verifier notes:** Fix implementation notes: saveState player snapshot exists for respawn targeting; halve wallet only (bank field is preserved in buildPostBattlePartySnapshot line 3481, so the wallet/bank split already exists); settlePendingMortalWoundsForBattleEnd is intentionally skipped on lose, so the game-over sequence should restore the lead explicitly rather than reusing that path.
- **files:** `apps/game/src/battleScene.ts`, `apps/game/src/chunkedWorldScene.ts`, `apps/game/src/battleReturn.ts`
- **evidence:** battleScene.ts handleBattleOutcome (line ~1578) sets phase 'lose' showing only 'The party fell.' (line 2451), then beginExitTransition explicitly skips mortal-wound settling on lose (line 1672) and exitBattle passes buildPostBattlePartySnapshot carrying battle-end HP (line 1717). chunkedWorldScene.applyReturnRestore (line 3365+) restores that party verbatim at the pre-battle position; restore.outcome is consulted ONLY by applyStoryGateReturn (line 3353). No revive/respawn/'keep trying' code exists anywhere (rg for revive|respawn|keep trying: only __debugHeal). Probe-verified: forced battle vs group 409, party hp:0 alive:false persisted through exit-transition. A wiped party walks the overworld dead; the next encounter opens at outcome 'lose' immediately — a soft game-breaking loop.
- **EB parity note:** EB on defeat: 'You lost the battle' beat, then a continue prompt; on continue you respawn at the last save (phone) location with Ness conscious/restored, other members unconscious, and half your ON-HAND cash lost (bank untouched). Confidence: high, strong memory of a well-documented core mechanic; not verifiable from local CoilSnake data (engine behavior, not map data).
- **recommendation:** Add a game-over sequence on outcome 'lose': fade + message, halve wallet (not bank), restore lead to full HP, respawn at the last save position (saveState already stores player snapshot), leave other members at 0 HP.

#### F76 · Battle winnings are paid straight into the wallet ('You got $X') instead of Dad depositing to the ATM bank account

- **status:** DIVERGES · **severity:** high · **class:** fix-candidate · **confidence:** high
- **verdict:** CONFIRMED — Code evidence verified at every cited line: applyVictoryRewards (battleLogic.ts:1216) credits moneyGained directly to state.wallet; the victory tally renders 'You got $X' (battleLogic.ts:1297, battleScene.ts:3226); chunkedWorldScene.ts:4971 syncs that wallet into partyState via applyBattleResult (partyState.ts:635-636), and bankValue is only mutated by manual ATM deposit/withdraw (partyState.ts:570-579) — no automatic bank inflow, no Dad-deposit code exists. The EB claim is verified against local extracted ROM text, not just memory: data_17.ccs:279-282 is Dad's phone call ('I deposited $X into
- **verifier notes:** One minor overstatement in the finding: the bank is not literally without inflow — the ATM deposit op works, so players can manually move wallet cash to bank. But with winnings paid as cash and no defeat cash-loss penalty found in battleLogic/chunkedWorldScene, the bank serves no gameplay purpose, so the substantive point stands. Implementation note for the fix: EB credits the bank at battle end silently and Dad reports the cumulative amount on the next save call — the fix should also thread the deposit-report line into the existing Dad phone save flow, and consider the related EB rule that losing a battle costs half your ON-HAND cash (bank is safe), which is the mechanic that makes the bank meaningful.
- **files:** `apps/game/src/battleLogic.ts`, `apps/game/src/battleScene.ts`
- **evidence:** battleLogic.ts applyVictoryRewards line 1216: wallet: stat(state.wallet) + moneyGained; victory tally page line 1297 / battleScene.ts line 3226 renders 'You got $X'. Meanwhile the full EB money loop is otherwise built: partyState has a separate bank (partyState.ts:256-270), the ATM deposit/withdraw menu exists (menuModel.ts buildAtmScreen line 969), and Dad phone save exists — so the bank currently has no inflow at all and the ATM is vestigial.
- **EB parity note:** EB: battle winnings are deposited by Dad into your bank account; you withdraw cash at ATMs. The victory screen does not hand you cash. Confidence: high (core, well-documented EB mechanic; strong memory).
- **recommendation:** Route moneyGained to bank instead of wallet in applyVictoryRewards, and change the tally line to the Dad-deposit phrasing (Swagbound-voiced). This also makes the existing ATM meaningful.

#### F77 · Victory EXP is granted in full to every living member instead of being divided among conscious party members

- **status:** DIVERGES · **severity:** high · **class:** fix-candidate · **confidence:** medium
- **verdict:** CONFIRMED — Code evidence verified: applyVictoryRewards in apps/game/src/battleLogic.ts sums defeated enemies' exp into expGained (line 1210) and applies the FULL total to every living party member (line 1258) with no division. EB claim verified against the actual EarthBound disassembly (github.com/Herringway/ebsrc): in both src/battle/main_battle_routine.asm (victory path) and src/battle/instant_win_handler.asm, total enemy exp is summed into BATTLE_EXP_SCRATCH, then divided by COUNT_CHARS(0) — the count of conscious, non-diamondized party members — using round-UP division ((total + n-1) / n via DIVISION
- **verifier notes:** EB rounding is ceiling ((total + n - 1) / n), not floor as the recommendation states. COUNT_CHARS excludes unconscious AND diamondized members and NPC battlers (npc_id != 0), and the same eligibility filter gates who receives the share — mirror that filter when fixing. EB also passes the divided share into the win message (MSG_BTL_PLAYER_WIN), so the parity-correct victory text shows per-member exp, not the battle total.
- **files:** `apps/game/src/battleLogic.ts`
- **evidence:** battleLogic.ts applyVictoryRewards lines 1252-1264: nextState.party.map(member => applyExperienceToCombatant(member, expGained, ...)) — the full expGained total is applied to EACH living member with no division. With the Act-1 duo this doubles effective exp income vs the tuned EB pacing; with a 4-hero party it quadruples it.
- **EB parity note:** EB divides total battle EXP evenly among conscious party members (why solo-Ness Magicant levels so fast). Confidence: medium-high — consistent strong memory plus the Magicant design corollary; not verifiable from local CoilSnake data. Note the repo's act1 balance work was tuned against current behavior, so fixing this needs a rebalance pass.
- **recommendation:** Divide expGained by the count of conscious members before applyExperienceToCombatant (floor per EB), then re-run scripts/act1.mjs balance verification.

#### F78 · Encounter swirl is a rainbow hue-cycling spiral with no green/red advantage color signaling

- **status:** DIVERGES · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/transitions.ts`, `apps/game/src/chunkedWorldScene.ts`, `apps/game/src/battleScene.ts`
- **evidence:** transitions.ts drawSwirl (lines 62-145) computes band color from hue = segment/bands + arm/arms + clockMs/700 (line 105) — pure rainbow cycling. Neither SwirlDrawOptions nor any call site (chunkedWorldScene.beginEncounterSwirl line 4904, battleScene.renderEnterSwirl line 1704) passes the encounter advantage, even though touchAdvantage (overworldEnemies.ts:73-88) correctly computes partyFirstStrike/enemyFirstStrike/normal and feeds battleRound. The player gets no pre-battle signal they were ambushed.
- **EB parity note:** EB swirls are solid-colored spirals keyed to advantage: green for normal and player first-strike, red when the enemy catches you (enemy first strike); the ROM even ships them as distinct Swirls assets (external/coilsnake-full/Swirls exists locally). Confidence: high (strong memory + local Swirls directory).
- **recommendation:** Thread the resolved EncounterAdvantage into drawSwirl and tint the band palette green vs red (keep the animation), matching EB's signal.

#### F79 · Diagonal movement renders cardinal facing only and moves at normalized (0.707/axis) speed; EB uses 8-direction sprites and full per-axis speed

- **status:** DIVERGES · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/playerController.ts`
- **evidence:** playerController.ts header (lines 17-18): 'The runtime renders cardinal facings only; diagonal movement resolves to a cardinal facing' — even though the decoded CoilSnake sheets contain the diagonal walk frames (lines 13-16: frames 8-15 = NE/SE/SW/NW). stepPlayer line 168: scale = SQRT1_2 on diagonals, so diagonal speed equals cardinal speed (in-engine measured 112px/s cardinal). resolveFacing (121-140) snaps diagonals to a cardinal.
- **EB parity note:** EB is an 8-direction game: walking diagonally shows the dedicated diagonal walk sprites (the very frames these sheets carry), and movement is full speed on each axis so diagonal travel is ~1.41x — a staple EB speedrun tech. Sprite-facing confidence: high (the frames are decoded from EB's own sprite groups). Diagonal-speed confidence: medium (speedrun-community memory, not locally verifiable).
- **recommendation:** Add diagonal facings to the facing/anim state machine using frames 8-15 (fallback to cardinal for override skins lacking diagonals), and drop the SQRT1_2 normalization for the player.

#### F80 · No inventory capacity: give() and shop buying push unbounded items (EB caps at 14 slots/character incl. equipment)

- **status:** MISSING · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/partyState.ts`, `apps/game/src/chunkedWorldScene.ts`
- **evidence:** partyState.ts give (lines 303-308) is an unconditional push; buyItem checks only money; handleShopBuyAction (chunkedWorldScene.ts:2799+) has no capacity refusal; rg for capacity/full-inventory checks finds none. Escargo Express storage exists (menuModel PHONE_STORAGE_*), so the overflow-relief system is built while the constraint that motivates it is absent.
- **EB parity note:** EB: each character carries 14 item slots, equipped gear occupies slots, shops refuse with a 'you can't carry any more' message, drops are forfeited when full. Confidence: high (well-documented EB inventory model).
- **recommendation:** Enforce a 14-slot cap in give()/buyItem/battle drops with an EB-style refusal message; count equipped items against it.

#### F81 · Enemy assist/status battle actions: only 4 of ~318 EB battle actions have authored effects; the rest of the assist-type actions silently no-op

- **status:** ROUGH · **severity:** medium · **class:** fix-candidate · **confidence:** high
- **verdict:** unverified
- **files:** `content/enemy-action-effects.json`, `apps/game/src/battleLogic.ts`
- **evidence:** content/enemy-action-effects.json byActionId has exactly 4 entries (Lifeup alpha 32, Defense down alpha 50, PSI Magnet alpha 54, poison bite 242). battleLogic.ts resolveEnemyActionTurn line ~916: effectKind 'assist' with no authored effect (and kind 'unknown'/'statusStub') resolves with targets: [] and amount 0 — the enemy announces a move that does nothing. Local ground truth external/coilsnake-full/battle_action_table.yml has 318 actions, many of them enemy heals/shields/status attacks used throughout Act 1+ (heal narration was just fixed in commit b40d77f, confirming this layer is active).
- **EB parity note:** EB drives every enemy turn from the battle action table: Lifeup beta/gamma, PSI Shield, Hypnosis, paralysis, fire/freeze, stat debuffs etc. all have real effects. Confidence: high (local battle_action_table.yml + std EB behavior).
- **recommendation:** Grind the action table: map the remaining assist/status action ids used by Act-1 enemy rosters first (cross-reference enemy Actions in enemy_configuration_table), reusing the existing effect kinds (healHp/buffStat/inflictStatus/drainPp already work).

#### F82 · Interior camera zooms up to 3.5x (variable, non-integer) — EB never changes pixel scale

- **status:** DIVERGES · **severity:** medium · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/chunkedWorldScene.ts`
- **evidence:** updateCameraRoomBounds (lines 1230-1243): fillZoom = max(OVERWORLD_CAMERA_ZOOM, camera.width/room.width, camera.height/room.height), capped at INTERIOR_CAMera_MAX_ZOOM 3.5 — small rooms render at arbitrary non-integer zooms (e.g. 2.56x), changing sprite pixel density room-to-room and causing pixel shimmer at the native 512x448 viewport. Overworld is exactly 2x (256x224 world px = SNES native, correct).
- **EB parity note:** EB renders everything at a fixed 1x SNES scale; rooms smaller than the screen show surrounding black with the camera clamped — no zoom hardware exists. Confidence: high. The zoom here solves a real problem EB didn't have (masked interior edges revealing void), so this is a design tradeoff, not an oversight.
- **recommendation:** Creative call: either accept the zoom as Swagbound presentation, or restore fixed 2x + centered room with letterboxed black fill (EB-faithful). If kept, consider snapping to integer zoom steps to kill shimmer.

#### F83 · X-cancel skip-to-end works on ALL dialogue including one-shot scripted beats — EB has no dialogue cancel at all

- **status:** DIVERGES · **severity:** low · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/chunkedWorldScene.ts`
- **evidence:** closeDialogue (lines 5332-5351) implements cancel as skip-to-end: aborts the event sequence but fires pendingScriptedDialogueComplete. Probe-verified: pressing X on the opening cold-signal beat closed it AND set completion flags signal:cold-signal-seen + cutscene:signal-town-cold-signal-open — no stranded state. The UI advertises it ('Z: advance | X: close', line 2574).
- **EB parity note:** EB has no dialogue-cancel input; B only toggles faster text printing — every scripted beat must be read through. Confidence: high (strong memory). The current implementation is SAFE parity-wise (effects fire), so the open question is purely whether authored story beats should be skippable.
- **recommendation:** Keep skip-to-end for replays/dev, but consider marking key one-shot story beats unskippable (a per-trigger 'unskippable' flag) so first-run players can't accidentally X through Act-1 narrative.

#### F84 · Unflagged non-EB conveniences: P-key save-anywhere and the always-visible helper prompt bar

- **status:** DIVERGES · **severity:** low · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/chunkedWorldScene.ts`, `apps/game/src/uiScene.ts`
- **evidence:** (a) chunkedWorldScene.ts:777 binds keydown-P → handleSaveKey → saveGame(false): silent save anywhere, anytime — undermines the Dad-phone save loop that IS correctly implemented (handlePhoneServiceAction 'dad' → save, line 2937). (b) updatePrompt (lines 2569-2582) + uiScene promptText keep a persistent instruction line on screen ('Z: talk to NAME', 'Move: Arrows/WASD...'); neither is on the approved intentional-divergence list (the vitals HUD is, this prompt bar is not).
- **EB parity note:** EB saves ONLY by phoning Dad and has zero persistent screen furniture beyond the game world. Confidence: high. Both are QoL/dev additions nobody flagged.
- **recommendation:** Decide: gate the P-save behind dev builds (import.meta.env.DEV like F1/F2 already are, line 785), and decide whether the prompt bar is tutorial-only (e.g. fade out after first N interactions) or part of the clean-UI language.

#### F85 · Phone system lacks the EB Dad/Mom mechanics: no homesickness, no Dad level-progress commentary

- **status:** MISSING · **severity:** low · **class:** needs-creative-call · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/chunkedWorldScene.ts`
- **evidence:** handlePhoneServiceAction (lines 2936-2950): 'mom' → static 'Mom says you're doing great.'; 'dad' → save with 'Dad saved your game.' — no exp/level recap, no homesickness cure hook. No homesickness status exists anywhere (statusEffects.ts model: poisoned/paralyzed/asleep/confused/shielded only).
- **EB parity note:** EB: Ness periodically becomes Homesick (battle turns lost to daydreaming) and calling Mom cures it; Dad recaps exp gained and needed-to-next-level when you call to save. Confidence: high on both mechanics (well-documented). Whether solo Bosch should inherit homesickness is a Swagbound voice/design call.
- **recommendation:** At minimum give Dad the exp-recap lines (data is available in partyState). Homesickness is a creative call — it is very Ness-specific flavor that could translate well to the Bosch 'public version' arc.

#### F86 · Minor field/battle presentation trivia (grouped): ATM fixed denominations vs EB digit entry; battle command grid order differs from EB; hotel/hospital lack EB presentation beats; victory money line phrasing

- **status:** ROUGH · **severity:** low · **class:** fix-candidate · **confidence:** medium
- **verdict:** unverified
- **files:** `apps/game/src/menuModel.ts`, `apps/game/src/battleScene.ts`, `apps/game/src/chunkedWorldScene.ts`
- **evidence:** (a) menuModel.ts:331 ATM_AMOUNT_OPTIONS=[10,50,100,500,1000] fixed rows — EB prompts free digit entry for deposit/withdraw amounts (confidence high). (b) Battle grid is BASH/GOODS/AUTO over PSI/DEFEND/RUN — EB's is Bash/PSI/Goods over Auto Fight/Defend/Run Away (confidence medium; the LOOK is intentionally custom but slot order was aiming at EB structure). (c) Hotel/hospital resolve instantly via Yes/No menu with 'Done.'-style text (handleAtm/hotel actions ~line 2795+) — EB hotels fade to black with a jingle and 'Good morning' beat (confidence high). (d) Victory tally rolls EXP and money as odometers — EB prints them as text pages; rolling meters are HP/PP-only in EB (confidence medium). Sell-at-half-price (partyState.ts:1064) and pause-menu 6-item structure (menuModel.ts:341) were checked and MATCH EB.
- **EB parity note:** Each item states EB behavior + confidence inline above; none is locally verifiable from CoilSnake data (engine/UI behaviors), all from strong-to-medium memory.
- **recommendation:** Cheap wins in one pass: add an amount-entry row to the ATM, swap AUTO/PSI grid slots, add a hotel fade+jingle beat. Odometer tally is arguably a nice Swagbound flourish — flag to Nick rather than auto-fix.

#### F87 · CONFIRMED parity wins on this branch (positive verification): formation amounts, duplicate lettering, text blips, turn-to-face, mortal-wound rolling HP, enemy dissolve, sold-out shops, field poison, static enemy sprites, single walk speed, native viewport

- **status:** EXISTS · **severity:** low · **class:** intentional-divergence · **confidence:** high
- **verdict:** unverified
- **files:** `apps/game/src/battleLogic.ts`, `apps/game/src/transitions.ts`, `apps/game/src/rollingMeter.ts`, `apps/game/src/chunkedWorldScene.ts`
- **evidence:** Verified as EB-correct: formation entries match external/coilsnake-full/enemy_groups.yml exactly (spot-checked groups 0={3x159}, 27={2x123,1x29}, 30={4x5}, 32={2x7}; 154/405 groups have amount>1); duplicate enemies lettered 'Name A/B' (battleLogic.ts:1759-1781, matches EB's letter-suffix format, confidence high); per-character text blips exist and throttle on whitespace (transitionSfx.textBlip + tickDialogueBlip line 1296); NPCs turn to face the player on talk and restore facing after (pauseNpcForDialogue); mortal-wound rolling-HP rescue window implemented (rollingMeter.survivesFatalBlowWindow + settlePendingPartyMortalWounds, probe showed hpDisplayed/hpTarget/isRolling live); enemies flash+dissolve on defeat (enemyDefeatVisualState, battleScene 2976-3023); SOLD OUT rows (menuModel:551-560); field poison step drain (applyFieldPoisonForStep:3139); enemy battle sprites static (no bob/breath code); one walk speed, no run button (PLAYER_SPEED=110, measured 112px/s live); overworld camera = exact 256x224 SNES window at 2x; sell price = floor(cost/2) matches EB; Dad-phone save matches EB; touch advantage front/behind semantics match EB.
- **EB parity note:** This is the referee's confirmation list so later audits don't re-flag these; classification field is inapplicable (these conform to EB or to already-approved divergences).
- **recommendation:** No action. Keep this list as regression-check anchors for future parity sweeps.

---

# Fix status — FINAL (fix/audit-sweep @ 203f081)

- **Track A (a171ae5):** F01/F02 X-cancel skip-to-end, F13 equip compounding, F24 generated drift (139 roaming-enemy skins restored), F25 silent loader, F31 follower sprite. All browser-verified.
- **Track B (52fa14a, b40d77f):** F42 formation amounts + A/B lettering, F43 action direction (ally heals), F44/F15 enemy status/PSI effects (Coil Snake poisons live), heal-narration recipient fix. All browser-verified.
- **Map burst (a849aa0, 3997d9c):** 7 warp-landing rects removed + generator doors[] cross-check; dead cave door #477/478 repointed to the EB warp landing (2864,3080), both verified live. Converter root fix -> follow-up chip.
- **Track C (395ac30, a280584, 876b929, 5476510):** F18 battle-scoped ailments clear, F16 killing-blow linger (live), F17 encounter RNG seed, F46 EXP split with EB CEILING division (live round-trips), F48 real PP costs, F49 PSI multi-target (live: PSI Fire hit all 3), F34 green/red swirls (live screenshots), F14 shared AudioContext, F03 field-item gating, F19 DEFEND gate.
- **Track E (25e1fa1):** shops event-merge — custom pages + preserved CCS function (live: NPC 311 talks then opens shop); hotels 256/483/890/1020/1124 + ATM 1375 service keys; game-over flow (live: respawn, lead restored, others KO); winnings -> bank (live: bank 0->5). Dad-deposit wording provisional.
- **Track D (203f081):** F32 cutscene-hidden persistence, F33 idle wobble removed (live: {0,0}), F38 cutscene sound cues, F08 mid-session follower respawn, F37 STRETCH follower chain for heroes 3-4 (live: 4-hero parade).
- **END-TO-END:** scripts/act1.mjs autorun on the final build: ACT 1 COMPLETE, 3/3 bosses (Malady fight ran with both antoid minions), act1:complete flag reached.
- **Deferred (chips filed):** style-33 warp-table converter routing; chunk-seam foreground occlusion (2421 tiles); EB 14-slot inventory cap; enemy action effects beyond the Act-1 set.
- **Creative calls for Nick (untouched):** interior camera 3.5x zoom (EB never scales), diagonal movement uses cardinal sprites at normalized speed (EB has 8-dir sprites at full per-axis speed), X-cancel exists at all (EB has no dialogue cancel — current behavior is safe skip-to-end), P-key save-anywhere + helper prompt bar, single-frame NPC skin hop, "The connect wired \$X to your account." wording, Dad/Mom phone mechanics (homesickness, level commentary), ATM fixed denominations vs EB digit entry, battle command grid order, buy-list cursor at 0 money, new-game spawn facing a NOTICE sign.
