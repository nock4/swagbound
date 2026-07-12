Battle engine:
apps/game/src/battleLogic.ts:593 | severity med | defect | `resolvePhysicalAttackDamage` decides Guts survival before shield reduction, so a shielded party member can falsely "survive" a hit that shield would already make nonlethal and then take the shield-reduced survivor damage instead.
apps/game/src/battleRound.ts:1276 | severity med | defect | `firstLivingQueuedRunActor` accepts any living RUN command without checking `paralyzed` or `asleep`, so a status-gated character can still resolve the round-start flee attempt and escape before `resolveCombatantTurnGate` ever runs.
apps/game/src/battleLogic.ts:1780 | severity med | defect | Enemy actions with authored effects and target code `0` fall through to `[]` targets before `selection.effect` is applied; generated actionId 96 self-buffs on New Age Retro Hippie / Over Zealous Cop / Tough Guy silently do nothing instead of raising offense.
apps/game/src/battleRound.ts:668 | severity med | defect | The GOODS target-ally menu is seeded from `livingIndices`, but revive effects resolve fainted members, so with multiple KO'd party members the player cannot choose the intended revive target and `resolveFaintedPartyTarget` falls back to the first fainted slot.

The monolith:
apps/game/src/chunkedWorldScene.ts:5723 | severity med | defect | Story-gate victory applies `reconcileRecruits` before `partyState.restore(restore.party)`, so a battle-gated trigger that sets a `recruit:*` flag can set the flag, add the recruit, then immediately overwrite the party with the pre-return snapshot.
apps/game/src/chunkedWorldScene.ts:7674 | severity med | defect | Battle-backed story triggers pass only `triggerId`, `once`, `setFlags`, and `clearFlags` into `PendingStoryGate`, so a schema-valid trigger with `battleGroup` plus `grantItems` will win the battle without granting its authored item.
apps/game/src/chunkedWorldScene.ts:7697 | severity low | defect | The story-trigger warp branch returns before `afterDialogueClosed`, so a failed, invalid, or instant trigger warp can leave the player locked by the dialogue-trigger path with no cleanup callback.
apps/game/src/chunkedWorldScene.ts:1219 | severity low | defect | DEV globals such as `__devToolsDebug` are installed with closures over the scene but are not removed in the shutdown cleanup, so scene restarts can retain stale scene objects and debug state until another create path overwrites them.

Systems:
apps/game/src/doorTriggers.ts:42 | severity low | defect | `doorActiveForFlags` parses the schema's string `eventFlag` as hexadecimal unconditionally, so a decimal string like `466` would test EB flag 0x466 instead of 466 and retire or keep a conditional door on the wrong flag.

Converter:
packages/eb-converter/src/world.ts:1001 | severity med | defect | Missing door destinations are converted to `destinationWorldPixel: worldPixel`; the current generated world has 92 stairway/escalator rows self-targeting, so touching those transitions no-ops instead of moving floors.
packages/eb-converter/src/fts.ts:226 | severity med | defect | `parseFts` validates only the first arrangement line shape, then slices later arrangement lines without a length/hex check; a truncated row writes `NaN` into typed arrays as zero and silently corrupts tile art/collision.
packages/eb-converter/src/world.ts:979 | severity med | defect | Door destination scaling is all-or-nothing per row, so a mixed-unit row with one over-range pixel coordinate and one valid 8px-grid coordinate emits the grid coordinate unscaled and lands the warp thousands of pixels off.

Executive summary: Battle has four player-visible correctness issues; shield/Guts ordering, status-gated RUN, authored enemy self-buffs, and revive targeting are the highest-confidence ones.
Executive summary: Story-gate return code is the main monolith risk because deferred battle wins do not carry every schema-valid effect and can lose recruit side effects.
Executive summary: Door conversion currently emits 92 stair/escalator self-warps, leaving those transitions inert at runtime.
Executive summary: Converter parsers still have silent-corruption paths for mixed-unit door rows and truncated FTS arrangements.
Executive summary: Content invariant probes found no trigger cycles, no missing cutscene NPCs after added NPCs, and no missing sprite override images.
