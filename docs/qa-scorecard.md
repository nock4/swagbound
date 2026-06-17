# Swagbound Slice — QA Scorecard

Data + pure-logic audit of the Swagbound playable slice (New Game -> Onett -> Giant Step first boss). No browser was run; runtime UI behaviors are flagged as browser gates below. Scope: generated data (gitignored) + pure-logic modules exercised via vitest. No EarthBound strings written; numeric ids + Swagbound names only.

Domains audited: maps-interiors, npc-dialogue, menus, shops-services, battle-combat, leveling-skills, save-rest.

## Summary

| Metric | Count |
|---|---|
| Total checks run | 119 |
| Passed | 94 |
| Failed (status: fail findings) | 8 |
| Confirmed bugs (status: fail) | 8 |
| Needs-browser gates | 10 |
| Warn (latent / low) | 4 |
| New durable vitest files authored (all green) | 7 |

Confirmed-bug severity mix: 3 high, 5 med.

> Count note: the per-domain self-reported `failed` integers summed to 10, but that included one `warn` (battle status-stub) and one `needs-browser` (save flow). The authoritative figure is the number of `status: fail` findings, which is 8 (listed below).

New tests authored and locked green: `apps/game/test/qa-maps-interiors.test.ts`, `qa-npc-dialogue.test.ts`, `qa-menus.test.ts`, `qa-shops.test.ts`, `qa-battle.test.ts`, `qa-leveling.test.ts`, `qa-save.test.ts`.

---

## Confirmed bugs (to fix), sorted by severity

These are status `fail` only (in-slice, evidence-backed, reproducible at the data/logic level). needs-browser and out-of-slice items are excluded.

### HIGH

1. **`svc-partystat-heal-noop` — Hospital/hotel/home-rest restore no HP/PP** (domain: shops-services)
   - `apps/game/src/eventHost.ts:364-366` `partyStat()` only calls `skipUnsupported(...)` with no apply branch (contrast `money()` :272-277, `give()` :258-263, `atm()` :279-284). EB heal opcodes (`heal_percent` x11, `recoverpp_percent` x8) decode to a `partyStat` EventEffect but do nothing. Runtime probe: full-heal call on a 1/100-HP, 0/30-PP member left vitals unchanged.
   - Fix: implement field heal/recover in PartyState (mirror `applyUseEffectToVitals`), apply it from `eventHost.partyStat` after the guard, resolve whole-party vs single-member `char` semantics, add a vitest. (spawn task_8c967661)

2. **`battle-goods-item-decode-dead` — In-battle GOODS item use is non-functional** (domain: battle-combat)
   - `decodeItemUseEffect` (`apps/game/src/partyState.ts:530`) keys on `item.action` in {2,7682,0,7680,6,7686,4,7684}, but 0 of 254 real items use those codes (action codes are pointer indices like 249, argument 0). The 4 grocery consumables (ids 106/232/89/90, store 4 / npc 749) all decode to `undefined`; `resolveItemTurn` blocks every consumable with `unknownEffect`.
   - Fix: pipeline gap — fix the item emitter (`packages/eb-pipeline`) to populate `item.action`/`argument` with decoded EB action-code + magnitude, OR add a pointer->effect resolution layer in `decodeItemUseEffect`. Add a durable test loading real items.json asserting ids 106/232/89/90 decode to heal/pp effects.

3. **`lvl-01-earlygame-stat-dead-zone` — Early level-ups (L2-L7) grant zero stat/HP/PP gains** (domain: leveling-skills)
   - `battleLogic.ts:1349-1363` merges `calculateStatsAtLevel` with `Math.max`, but `characterModel.ts:126-138` seeds the calc from a neutral baseline (offense 2 / maxHp 30 / maxPp 10) while characters.json char 0 base stats are high (offense 18 / maxHp 75). `calculateStatsAtLevel(char0.growth, 5)` = offense 9 / maxHp 60, both below the data base, so gains are 0. First positive gain only at L8; offense first exceeds base at L11. Boss group 450 (~685 EXP) lands char 0 at L7 — entire slice sits in the zero-gain band.
   - Fix: reconcile the data generator (seeds L1 base from growth vars) with `calculateStatsAtLevel` (assumes neutral L1 baseline). Either start the calc from the character's actual data base stats at their starting level, or have the generator emit neutral L1 base stats. (spawn task_30cec0ab)

4. **`save-rest-01` — No rest-at-home / hotel mechanic; HP/PP restore unimplemented** (domain: save-rest)
   - `eventRunner.ts` GameEvent union is only dialogue|setFlag|shop. No rest/heal event, no rest menu action, no heal-party method anywhere in `apps/game/src`. NPC 148 (home-rest/mom) and NPC 115 (hospital greeter) have no special handler and are not in custom-dialogue byNpcId keys — they resolve to plain dialogue only. (Closely related to `svc-partystat-heal-noop`: both mean party vitals never get restored in the field.)
   - Fix: add a `rest`/`heal` GameEvent kind (or scene method) calling `partyState.restore()` with each battleMember hp=maxHp, pp=maxPp, then save; wire NPC 148 and any in-slice hotel greeter to dispatch it.

### MED

5. **`menu-atm-card-name-leak` — Goods menu shows EB item name "ATM card" at slice start** (domain: menus)
   - characters.json: Ness (char 0) `startingItems = [177]`. items.json id 177 name = "ATM card". `content/item-overrides.json` has NO key "177" (135 entries cover only shop-stocked items). `resolver.itemName(177)` returns the raw EB name; `menuModel.inventoryEntries` renders it. Immediately reachable: open pause menu -> Goods.
   - Fix: add an override for 177 (and 208 for completeness) to `content/item-overrides.json`. Note `itemOverrides.test.ts` asserts override key set EQUALS the shop-item id set, so relax it to allow non-shop starting-inventory items.

6. **`menu-character-name-leak` — Status/member-select show raw EB character names (Ness/Paula/Jeff/Poo)** (domain: menus)
   - `menuModel.ts:418/562/602/628/748` use `member.name` directly. `characterModel.buildPartyMember:47` sets name from characters.json (ids 0..3 are the EB names). No character-name override file and no naming/rename flow exist. `createDialogueResolver.playerName()` also returns char 0's EB name, so the leak is systemic at the character layer.
   - Fix: introduce a character-name override (e.g. `content/character-overrides.json` byCharId) applied in loader, then route menu `member.name` through a resolver or overwrite characters.json names at load.

7. **`lvl-02-learned-skill-not-reported` — Level-up summary never surfaces newly-learned PSI/skills** (domain: leveling-skills)
   - `BattleLevelUpSummary` (`battleLogic.ts:171-177`) carries only statGains; `buildVictorySummaryViewModel` (:928-943) emits only EXP/$swag/Found/Lv lines. `applyExperienceToCombatant` never diffs `learnedPsiForCombatant` across the level change. Probe: char 0 +150 EXP -> L5 learns psiId 23,43 but the view model shows no "learned" line.
   - Fix: in `applyExperienceToCombatant`, diff learned PSI before/after, add a `learnedSkills` field to `BattleLevelUpSummary`, append "Learned <name>" lines in `buildVictorySummaryViewModel`. Thread the PSI collection through `applyVictoryRewards`. Use Swagbound display names, not raw psi.json names.

8. **`save-rest-02` — Field-only vitals (HP/PP changed by field item use) are lost across save/load** (domain: save-rest)
   - `snapshot()` derives vitals only from `battleMembers` (`partyState.ts:449`), not the field vitals map. A `useItem` field heal writes `vitalsByChar` but no battleMember, so after save/load `reloaded.vitals(1) === undefined` — the healed target is silently dropped. `restore()` (:480-489) only repopulates from `snapshot.battleMembers`. Reachable at New Game start (heal before any battle).
   - Fix: persist a vitals section in `snapshot()`/`restore()` (carried through `validateSaveState`), or ensure field heal also writes a battleMember entry. Add a vitest asserting `vitals(1).hp.target` survives a save round-trip after a field heal with no prior battle.

---

## Pass/fail by domain

### maps-interiors (23 checks, 18 pass, 0 fail)

| Check | Status | Severity | Evidence | Fix hint |
|---|---|---|---|---|
| All in-slice door warps resolve to walkable landings; spawn walkable (MI-01) | pass | none | Spawn (2112,1768) not solid, footprint-clear, in 32,698-cell overworld. 34 spawn-reachable doors all resolve within ring=1. No (0,0)/neg/OOB among 1164 doors. | None; locked by qa-maps-interiors.test.ts |
| Sector clip metadata present + schema-valid; bounded interiors isolated (MI-02) | pass | none | areaIds/indoor/bounded all len 2560; 1177 bounded, 374 indoor, 171 distinct interior ids; hospital/bakery resolve isInterior with small masks; item-shop sector has 1 open seam (doorway). | None; browser should confirm no neighbor-bleed at native |
| Bakery + hospital interiors round-trip and reachable on foot (MI-03) | pass | none | Bakery enter idx203 / exit idx184 round-trip; hospital via foyer idx197/185/186; doormats reachableFromSpawn. | None; locked by qa-maps-interiors.test.ts |
| Item-shop (404) & grocery (749) doormats disconnected from Onett spawn (MI-04) | needs-browser | med | Item-shop doormat (4112,7608) floods to a 6,806-cell Twoson-band component; grocery (1400,9944) to a 47,255-cell southern component; neither intersects spawn overworld. Interiors round-trip internally. | Walk south from spawn in-browser; if meant in-slice, converter must place doormats in the Onett component (or add a connector); else update slice doc |
| 4 out-of-slice door warps can't place footprint within 8-ring (MI-05) | warn | low | dest (6368,264) needs ring 10; dest (3192,1152) cell is solid, needs ring 18. All 4 triggers outside spawn overworld. Only 2 of 1164 doors have a solid dest cell. | Out of slice; if scoped later, bump maxRing or fix dest coords; re-run scripts/collision-audit.ts |
| 3 bounded interiors lack a door/teleport landing (MI-06) | needs-browser | low | 7 of 171 bounded interiors have no door landing; 1 reached by teleport (Onett ~3072,1024); 3 south interiors have neither door nor teleport. All out of slice. | Not a blocker; verify adjacent-sector walk entry if later needed |
| Door table emits only warpable types (MI-07) | pass | none | doorTypes total 2080 across 8 types; doors[] = 1164 (door/stairway/escalator only); 916 ladder/rope/object/person/switch intentionally excluded. | None; confirm no in-slice path needs a ladder/rope |

### npc-dialogue (14 checks, 12 pass, 0 fail)

| Check | Status | Severity | Evidence | Fix hint |
|---|---|---|---|---|
| All 81 added building NPCs resolve to renderable dialogue (npcdlg-added-coverage) | pass | none | added-npcs.json has 81 npcs (100100..100180, no gaps/collisions); 80 inline pages, 1 (100102 Bonkle) ref; all render. | None |
| Every custom-dialogue ref resolves in the library (npcdlg-ref-resolution) | pass | none | All refs across byNpcId/byTextPointer/added-npcs exist in swagbound-dialogue-library.json; 0 unresolved. | None |
| Shop clerks 404 (Sal) & 749 (Morrow) wired to override dialogue + stores (npcdlg-shop-clerks) | pass | none | 404 => pages(3)+shop(1)+setFlag; 749 => pages(3)+shop(4)+setFlag. Matches drug-store=1, grocery=4. | None |
| Named trio (Bonkle 100102, Sal 404, Morrow 749) all resolve (npcdlg-named-trio) | pass | none | Bonkle ref interior:neighbor-house-v0 => 3 pages; 404/749 verified. | None |
| byTextPointer override path fires on EB npc 143 (npcdlg-bytextpointer-path) | pass | none | npc 143 textPointer matches a byTextPointer key; returns pages(4) in both flag states. | None |
| All interactable EB NPC textPointers resolve (npcdlg-eb-fallback-coverage) | pass | none | 1314 interactable EB NPCs, 1019 distinct pointers; 0 "No imported script text" / "could not be loaded". | None |
| All 134 authored pages fit the 4-line window at native viewport (npcdlg-page-spill) | pass | none | At 512x448 box 480x132, textWidth 432, 4 visible lines; every authored page wraps to <=3 lines with real bitmap-font metrics (worst 166-char page still <=3 lines). | 110-char heuristic obsolete; keep line-count assertion |
| 3 EB pointers resolve to empty text but are event objects (npcdlg-empty-event-objects) | pass | low | npc 967 (person, control/pause), npc 1353/1357 (object, window+warp) build blank; movement/warp triggers, not talking NPCs. | No fix; if any becomes a talking NPC, add byNpcId entry |
| Stale comment in custom-dialogue.json claims town beats deferred (npcdlg-stale-comment) | warn | low | comment says Bonkle/Sal/Morrow beats deferred, but they're wired (byNpcId 404/749, added 100102). Doc drift only. | Update the comment; pure-text edit |
| Two library entries unreferenced (one is Act 2) (npcdlg-orphan-library-entries) | pass | low | dialogue:act2-coastal-kiosk (out of slice) + target:bosch-main-room-v0:receipt-router unreferenced; harmless dead content. | Leave act2; optionally wire receipt-router to a house prop or prune |
| Broken custom ref degrades gracefully to EB text (npcdlg-broken-ref-fallback) | pass | none | resolveCustomDialoguePages returns undefined on failed lookup, falls to dialogue:ref via EB textPointer (eventRunner.ts:52-53,114). | None; purely defensive today |
| On-screen render, reveal animation, key-driven advance (npcdlg-render-spill-browser) | needs-browser | none | Pages resolve + fit 4 lines, but rasterization, typewriter reveal, "more" arrow, Z/X advance are runtime-only. | See browser gates below |

### menus (19 checks, 15 pass, 2 fail)

| Check | Status | Severity | Evidence | Fix hint |
|---|---|---|---|---|
| Goods shows EB "ATM card" at slice start (menu-atm-card-name-leak) | **fail** | med | Ness startingItems=[177]; items.json 177="ATM card"; no override key "177". resolver.itemName(177) returns raw EB name in Goods/Check. | Add override for 177 (and 208); relax itemOverrides.test.ts key-set equality |
| Status/member-select show raw EB character names (menu-character-name-leak) | **fail** | med | menuModel.ts:418/562/602/628/748 use member.name; characters.json ids 0..3 = EB names; no override/rename flow; playerName() also returns EB name. | Add character-name override applied in loader; route member.name through resolver |
| Pause menu is exactly the vanilla 6 commands; Save/ATM not items (menu-six-command-parity) | pass | none | items = [Talk,Goods,PSI,Equip,Check,Status]; parseMenuAction("save")->{kind:"save"} (P key). | None |
| Currency label is "$swag" in shop + ATM wallet rows (menu-currency-swag) | pass | none | menuModel.ts:774 shop wallet `$swag ${wallet}`; :822 atm wallet `$swag ${wallet}`; no EB currency glyph path. | None |
| In-slice shops (stores 1 & 4) use Swagbound names + cost, no EB leak (menu-shop-overrides-no-leak) | pass | none | 404->shop1, 749->shop4; shop1 items 17/18/49/74/64 + shop4 106/232/89/90 all have overrides; buy labels `${override} ${cost}`. | None |
| All in-slice labels fit native 512x448 window at scale 2 (menu-label-fit-native) | pass | none | Box budget ~420px; widest shop label 138px, equip row 196px, PSI 152px, bare override 134px. MENU_MAX_VISIBLE_ITEMS=8 scrolls vertically. | None |
| fitMenuLabel caps LENGTH (44 chars) not pixel width (menu-fitlabel-char-not-pixel) | warn | low | 44 wide-glyph chars ~616px at scale 2 > 420px budget; not triggered (longest override 18 chars / worst composite 26 chars). | Lower char cap (~28) or measure pixel width + ellipsize |
| PSI menu would show EB PSI names after Ness hits L2 (menu-psi-eb-names-postlevelup) | needs-browser | low | psi.json has no override layer; resolvePsiName falls back to EB names. Char 0 learns nothing at L1 (empty PSI menu at start); EB names appear if Ness reaches L2 before the boss. | Confirm slice reaches L2+; if IP matters, add PSI-name override layer |
| Goods view model reflects real party data (qa-menus build) | pass | none | builds Ness's Goods list from generated startingItems with resolved names. | Covered by qa-menus.test.ts |

### shops-services (21 checks, 17 pass, 1 fail)

| Check | Status | Severity | Evidence | Fix hint |
|---|---|---|---|---|
| Hospital/hotel/home-rest restore no HP/PP (partyStat no-op) (svc-partystat-heal-noop) | **fail** | high | eventHost.ts:364-366 partyStat() only skipUnsupported, no apply. heal_percent x11 / recoverpp_percent x8 decode to partyStat. Runtime probe: full-heal left 1/100 HP, 0/30 PP unchanged. | Implement field heal/recover in PartyState, apply from eventHost.partyStat; resolve char semantics; add vitest (task_8c967661) |
| Hotel/hospital can charge $swag while delivering no heal (svc-pay-but-no-heal) | needs-browser | med | money("take") DOES deduct (eventHost.ts:272-277), so a cost-then-heal script charges the fee and heals nothing. Exact sequence not provable from coarse parser. | Browser: check wallet + HP/PP before/after rest; fixing svc-partystat heal resolves the heal half |
| Buy/sell math, affordability, floor(cost/2) rounding correct (shop-buysell-math) | pass | none | buyItem subtracts only if wallet>=cost else insufficientFunds; sellItem credits floor(cost/2), missingItem if not held; probes confirm exact-wallet and resell cases. | None |
| All 135 shop goods valid cost + unique Swagbound override (shop-override-coverage) | pass | none | 66 shops, 135 distinct stocked ids; 135 overrides in both generated + committed (identical); 0 missing/orphan/zero-cost/duplicate. Store1 + Store4 fully covered. | None |
| Shop labels lead with override + cost; visual fit unverified (shop-label-rendering) | needs-browser | low | menuModel.ts:444-455 buy labels fitMenuLabel(`${name} ${cost}`); longest 22 chars, 0 truncated; native window narrower than 44 chars so visual spill unprovable. | Browser: open store 1, confirm longest rows fit |
| Reachability classification (item shop in / Twoson out) (slice-reachability) | needs-browser | low | Item shop (store1/npc404) Onett in-slice. Grocery/bakery resolve but EB-canon Twoson — traversal question. Pizza/weapons Twoson out-of-slice. | Browser: confirm which service interiors are walk-reachable before Giant Step |

### battle-combat (14 checks, 11 pass, 2 fail)

| Check | Status | Severity | Evidence | Fix hint |
|---|---|---|---|---|
| In-battle GOODS item use non-functional (battle-goods-item-decode-dead) | **fail** | high | decodeItemUseEffect (partyState.ts:530) keys on action {2,7682,0,7680,6,7686,4,7684}; 0 of 254 items match (codes are pointer indices). Grocery consumables 106/232/89/90 decode undefined; resolveItemTurn blocks them. | Fix item emitter (eb-pipeline) to populate action/argument, OR add pointer->effect layer; durable test on real ids |
| Status-class enemy actions target=0 are silent no-ops (battle-enemy-action-target0-noop) | warn | low | targetActorsForEnemyAction returns [] for target not in {1..4}; 85 damaging actions have target=0 and ALL are actionType=5 statusStub (0 physical, 0 psi). Some bosses act fewer turns (enemy 130 acts 1/4). | Likely intentional stub; if bosses should pressure, route target=0 to first living member or implement status effect |
| RUN/flee always succeeds, no odds, no boss-block (battle-run-always-succeeds) | needs-browser | low | No flee logic in battleLogic; battleScene.ts:452-456 sets phase 'flee' unconditionally — can flee group 450. | Browser: start group 450, press RUN; if parity matters add speed-based flee-odds + boss block |
| Victory detection + EXP/money/drop rewards correct (battle-victory-rewards-correct) | pass | none | group 450 (37+209): exp 722, money 157 (summed); outcome 'win' only after all HP drained; drop guarded itemId<=0. | None; locked by qa-battle.test.ts |
| Damage formula + speed-sorted turn order correct/deterministic (battle-damage-turnorder-correct) | pass | none | base=max(1, off-floor(def/2)), spread 0.9-1.1, floor, min 1; off40 vs def23 -> 26/29/31; turnOrder desc speed with deterministic ties. | None |
| All Act-1 bosses present, boss-flagged, sane stats, 4 actions (battle-act1-bosses-present-sane) | pass | none | 143 enemies / 404 groups; group 450=[37,209]; enemy 37 (hp235 off19 def23), 130/131/214 present; every boss 4 actions actionType 0..5, target 0..4. | None |
| Per-char command sets, DEFEND, PSI, Pray/Spy/Mirror, enemy AI rotation (battle-command-resolution-correct) | pass | none | battleLogic.test.ts (35) green: commandsForCharId 0..3, DEFEND halving, PSI PP spend + insufficient block, SPY/Pray/Mirror, round-robin selectEnemyAction. | None for implemented commands |

### leveling-skills (14 checks, 10 pass, 2 fail)

| Check | Status | Severity | Evidence | Fix hint |
|---|---|---|---|---|
| Early level-ups (L2-L7) grant zero stat/HP/PP gains (lvl-01-earlygame-stat-dead-zone) | **fail** | high | calculateStatsAtLevel seeds neutral baseline (offense2/maxHp30) vs high data base (offense18/maxHp75); Math.max keeps base; first gain L8, offense exceeds base L11. Boss group 450 -> char 0 at L7, entire slice in zero-gain band. | Reconcile generator (seeds L1 from growth) with calc (neutral baseline); start calc from actual data base, or emit neutral L1 base (task_30cec0ab) |
| Level-up summary never reports newly-learned PSI (lvl-02-learned-skill-not-reported) | **fail** | med | BattleLevelUpSummary carries only statGains; buildVictorySummaryViewModel emits no learned line; char 0 +150 EXP -> L5 learns psiId 23,43 but view model silent. | Diff learnedPsiForCombatant pre/post, add learnedSkills field + "Learned <name>" lines; thread PSI list through applyVictoryRewards; use Swagbound names |
| EXP-to-level threshold crossing correct (lvl-03-level-threshold-crossing) | pass | none | levelForExperience over 99-entry expTable: 0->L1, 17->L3, 800->L8, 6000->L13; never regresses below currentLevel. | None |
| Per-level stat growth monotonic non-decreasing (lvl-04-stat-growth-monotonic) | pass | none | calculateStatsAtLevel L1..25: no field nor maxHp/maxPp ever decreases (offense 2->37, maxHp 30->180). | None |
| PSI learned at correct level; battle + menu gating consistent (lvl-05-learned-psi-by-level) | pass | none | learnedPsiForCombatant filters charId + level<=level; menu isLearnedByMember uses identical gate; synthetic L1->L6 learns at L3, excludes L99. | None |
| Victory summary reports EXP/$swag/level-ups, money only for KO'd (lvl-06-victory-summary-viewmodel) | pass | none | applyVictoryRewards sums only KO'd enemies; buildVictorySummaryViewModel emits EXP/$swag/Lv lines; probe 250 EXP/40 money correct. | None |
| Post-battle level-up / learned-skill window actually displays (lvl-07-victory-window-render) | needs-browser | low | View model produces lines (pure-logic verified) but on-screen render is UI-only. | See browser gates below |

### save-rest (14 checks, 11 pass, 3 fail)

| Check | Status | Severity | Evidence | Fix hint |
|---|---|---|---|---|
| No rest-at-home / hotel mechanic; HP/PP restore unimplemented (save-rest-01) | **fail** | high | GameEvent union only dialogue|setFlag|shop; no rest event, no rest menu action, no heal-party method; NPC 148/115 resolve to plain dialogue only. | Add rest/heal GameEvent calling partyState.restore() (hp=maxHp, pp=maxPp) + save; wire NPC 148 + hotel greeter |
| Field-only vitals lost across save/load (save-rest-02) | **fail** | med | snapshot() derives vitals from battleMembers only (partyState.ts:449); field useItem writes vitalsByChar but not battleMembers, so reloaded.vitals(1)===undefined. Reachable at New Game start. | Persist a vitals section in snapshot()/restore(), or write a battleMember on field heal; add vitest |
| Round-trip preserves party/inventory/equip/flags/wallet/bank/position (save-rest-03) | pass | none | wallet/bank independent (150/100); flags sorted-unique; inventory/equipped/party/battleMember/position exact; serialize idempotent. | None; locked by qa-save.test.ts |
| Corrupt/invalid/wrong-version blobs rejected (save-rest-04) | pass | none | deserialize returns null for null/''/corrupt/missing-section/schemaVersion 0|2/negative wallet/non-int wallet/invalid facing/invalid mode; valid v1 accepted. | None |
| localStorage save fails safe on quota/private-mode (save-rest-05) | pass | none | main.ts:152-200 guards localStorageOrNull + try/catch; saveGame treats false as not-saved; saveKey rejects bad slots. | None |
| Key-driven save + menu 'save' flow end-to-end (save-rest-06) | needs-browser | low | Save bound to keydown-P + menu action 'save'->saveGame(true); gates on !menu/!dialogue/!event + player present; toasts UI-only. | See browser gates below |

---

## Browser / visual gates for the orchestrator

Run these in a real browser at NATIVE 512x448 (do NOT upscale — upscaling hides font/window scale and spill bugs). Grouped by what they confirm.

**G1 — Dialogue rendering (npcdlg-render-spill-browser).** New Game -> walk Onett -> talk to Sal (404), Morrow (749), Bonkle (100102), hospital greeter (115), home guardian (148), bakery (43), and a house-interior NPC. Confirm each page renders fully inside the window with no vertical spill below the frame, the "more" arrow appears between multi-page beats, and Z/X advances pages. Confirm the shop opens after dialogue for 404/749.

**G2 — Service heal at native (svc-pay-but-no-heal; depends on svc-partystat-heal-noop fix).** Enter the Onett hotel and hospital; note wallet AND HP/PP before/after the rest/heal confirmation. Today: expect wallet decreases with HP/PP unchanged. Post-fix: expect wallet decreases by the fee AND HP/PP go to full. Also walk to NPC 148 (home-rest) and confirm party HP/PP meters roll to full, then P-save and reload to confirm restored vitals persist.

**G3 — Shop label fit (shop-label-rendering).** Open store 1; confirm the longest buy/sell rows fit inside the shop window with no spill or clipping against the cost column.

**G4 — Service reachability (slice-reachability + MI-04).** From New Game spawn, confirm which service interiors are walk-reachable before Giant Step: item shop / hospital / hotel (expected in-slice); grocery (749) and bakery (43) — VERIFY, their overworld doormats flood to the southern/Twoson map band disconnected from the Onett spawn component; pizza/weapons (expected unreachable -> out of slice, not a bug). Mark any in-slice service whose door does not lead to a populated clerk. If grocery/bakery are meant to be in-slice, the converter must place their doormats in the Onett (spawn-connected) component.

**G5 — Interior visual isolation (MI-02).** At native scale, confirm no visual neighbor-sector bleed at bounded interior edges (hospital, bakery, item-shop).

**G6 — PSI menu names post-level (menu-psi-eb-names-postlevelup).** Confirm whether the slice party reaches level 2+ before the first boss; if so, open the PSI menu and check whether EB PSI names appear (IP risk if so).

**G7 — Victory window render (lvl-07-victory-window-render).** Win the first boss (group 450); confirm the victory window shows EXP, $swag, and a "Lv N" line — and (after lvl-02 fix) a "Learned <skill>" line — with no spill at native viewport.

**G8 — Save flow (save-rest-06).** Press P in the field (no menu/dialogue open) and confirm a "Saved." result + persisted save on reload; open the menu, invoke 'save', confirm same; confirm save is a no-op while a dialogue or event sequence is running.

**G9 — Run/flee (battle-run-always-succeeds).** Start group 450, press RUN; confirm whether escape is allowed (EarthBound blocks boss escape; current code allows it).

**G10 — Enemy aggression on status turns (battle-enemy-action-target0-noop).** Observe a boss fight; confirm whether bosses should still pressure the party on status (target=0 actionType-5) turns — enemy 130 currently acts on only 1 of 4 rotation slots.

---

## Out-of-slice / deferred

These are intentionally beyond the New Game -> Onett -> Giant Step slice or are doc/data drift, not slice blockers. Do not treat as bugs.

- **MI-05** (low) — 4 out-of-slice door warps can't place footprint within the 8-ring; all triggers are in disconnected north/south areas. Fix only if those areas enter scope.
- **MI-06** (low) — 3 bounded south interiors (and 1 Onett teleport-only room) lack a door landing; all out of slice. Verify the Onett teleport room triggers in-game if it later matters.
- **MI-07** — 916 ladder/rope/object/person/switch entries are intentionally excluded from doors[] (correct). Confirm no in-slice path depends on a ladder/rope.
- **npcdlg-empty-event-objects** (low) — npc 967/1353/1357 build blank text but are movement/warp event objects, not talking NPCs; blank is correct.
- **npcdlg-orphan-library-entries** (low) — dialogue:act2-coastal-kiosk is explicitly Act 2 (out of slice); target:bosch-main-room-v0:receipt-router is an unwired house prop. Leave act2; wire or prune receipt-router.
- **npcdlg-stale-comment** (low) — custom-dialogue.json comment claims Bonkle/Sal/Morrow beats are deferred, but they are wired. Update the comment (pure-text, no logic).
- **menu-fitlabel-char-not-pixel** (low) — fitMenuLabel caps by char count (44) not pixel width; latent, not triggered while overrides stay <=24 chars.
- **battle-enemy-action-target0-noop** (low) — likely an intentional status-routine stub; no genuine physical/PSI attack is neutralized.
- **Pizza shop / weapons shop** — Twoson-area, out of slice; not flagged as bugs.

---

*Generated by the QA synthesizer from seven per-domain audits. Not committed. New durable tests are green and locked in; suspected bugs are reported, not fixed.*
