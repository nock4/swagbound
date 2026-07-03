# Act 1 — deferred narrative gaps

Status after the 2026-06-28 narrative pass. The Act-1 story spine plays
start → Malady → `act1:complete` in-engine (verified via `scripts/act1.mjs` +
`scripts/act1-gate-probe.mjs`), and the design's A–D beats are now wired except
for the items below. These were **explicitly deferred** because they need engine
code, not content-file authoring (`triggers.json` / `cutscenes.json` /
`added-npcs.json`).

Design source: `docs/swagbound-narrative-flowchart-editor.html` (SEED const, regions A–D)
and `~/Documents/nicks-mind-map/Wiki/projects/swagbound/`.

## Wired in this pass (no engine work)
- **A (cold-signal premise)** — `cutscenes.json` `signal-town-cold-signal-open`:
  staged the thesis (leaked version arrives before Bosch acts; "almost-right face";
  "I said it first"; VESSEL box; household "why is your face on a card") + first
  wayfinding cue (go west to the arcade). Fires at the new-game spawn.
- **C2 (rumor trio + notice board)** — `added-npcs.json` 100201/100202/100203
  (Witness Kid / Vessel Reader / Counterfeit Sniffer, verbatim bible lines) +
  100204 (layered-cards notice board with a "GATE NORTH, BY THE STATION" route slip).
- **C5 (turnstile)** — `added-npcs.json` 100205: "INSERT DOX SHEET" threshold
  beat, refuse-framed to match the runtime (which has no interactive choice yet).
- **Wayfinding** — `added-npcs.json` 100200 (spawn → west) and 100206 (police gate →
  north), plus directional cues folded into the `triggers.json` post-win reveals.
- **D (Malady→Milady)** — `triggers.json` first-threshold-malady-reveal now carries
  the bible's Ledger receipt cadence ("SIGNER — MALADY. CONTRACT OWNER — MILADY.
  Beating the symptom didn't kill the machine. It named it.") + a north-gate pointer.

### Tutorial woven into the early game (not a separate zone)
Controls are taught diegetically inside the beats above, in-voice:
- **Cold-signal open** ends with a movement/interact hint (Arrows move; Z to look/talk;
  go meet the stoop kid).
- **Stoop kid** (`added-npcs.json` 100200, at the spawn plaza ~(2064,1744)) is the
  tutorial mouthpiece: Z to talk, X for menu/pockets/stats, then "go west."
- **First fight** (card-clique `triggers.json` pre-battle dialogue) teaches combat:
  Z to lock in a move, BASH to swing, DEFEND when hurt, PSI when swinging won't cut it.
Controls reference: Arrows = move, Z/Space/Enter = confirm/talk/advance, X/Esc = cancel/menu.

## Deferred — need engine code

### B3 — Corner shop sells the "poison" items
Bible (`act-1-public-version-card-object-ladder.md`) specifies a Morningside corner
shop selling **Blank Dox Sheet**, **Clear Sleeve**, **Sticker Pack
(LOCAL/SOURCE/NORMAL)**, each incrementing a hidden `enemy_recognition_compliance`
when used. Needs: new entries in `content/item-overrides.json`, a shop wired to a
clerk NPC (`interaction.shop`), and a compliance counter the battle/gate logic reads.
Content-only authoring can add the *items*, but the "use raises canon drag" mechanic
is engine work.

### C3 — `Carded` battle status effect
Bible (`act-1-overworld-story-beat-pass.md` / provenance refinement) wants a `Carded`
status: enemy moves "quote the back of your card", Bosch becomes more targetable by
classification enemies, witness-depth/canon-drag rise faster, cured by refusing a
proof prompt. The status-effect system exists (`statusEffects.ts`, see memory
`battle-status-effects`) but a `Carded` kind + its targeting/decay hooks are new code.

### A1–A3 — Full EarthBound-intro replacement (name screen + bedroom objects)
The cold-signal *premise* is now staged (see above), but the literal A-region beats —
the **name screen flickering wrong variants** (A2) and **bedroom objects showing
unremembered events** (A3) — still ride EarthBound's vanilla intro path
(`newGameOpening.ts`, meteor/Buzz-Buzz, with VM stubs noted in `INTRO_ACTOR_VM_STUBS`).
Replacing the name-entry screen and authoring inspectable bedroom objects are engine
tasks, not content-file authoring.

## Canon decision pending (not a bug)
The bible's **latest** Suppression Center language (`act-1-relay-yard-hot-wallet-threshold-
canon-alignment.md`, 2026-05-13) reworks the threshold around a **Hot Wallet** object
(scan → category stamp → Ledger receipt) and explicitly states it was **never
promoted to runtime** (blocked on the interior dialogue schema). The runtime keeps the
older-but-approved **Dox Sheet** object. This pass folded in only the Ledger
*reveal cadence*; a full switch to Hot Wallet is a creative call for Nick.
