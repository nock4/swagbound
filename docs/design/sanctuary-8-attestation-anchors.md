# The Eight Sources (Sanctuary-8 → Attestation Anchors)

Concepts finalized 2026-07-10 (Nick: "use your best judgment for all"). Each site
follows EB's sanctuary grammar: a visible landmark, a guardian fight, then a
MEMORY FRAGMENT — something the original remembers that no copy carries — and a
track added to the **Original Mixtape** (item 196, EB's Sound Stone: already a
key item with field-use = "play what you have so far"; rename via
item-overrides). Track sources: Nick's own catalog (the game's music IS the
mixtape; per-site track picks are Nick's call at authoring time).

Copy rule: no em dashes in any player-facing line.

## The recalibration (best-judgment call, veto anytime)

- Anchors 1-4 sit ON the existing mandatory path (acts 1-3).
- Anchors 5-8 become the act 3→4 bridge: after Dead Letter, the raid seal stays
  shut until all eight Sources are attested. This makes The Galleria, Solana
  Beach, Vacancy Flats, and The Unlisted Room load-bearing instead of decorative,
  and gives the mid-game EB's collect-the-eight spine.
- All eight cleared → the Mixtape plays through once (the Sound-Stone-in-Magicant
  moment) → `raid:morningside:active`. The finale beat: Bosch walks into the raid
  with the only complete original recording in the world.

## The sites

### 1. The First Threshold — Morningside (LIVE)
EB: Giant Step / FLG_WIN_GIAN_BOSS (190). Story flag: `signal:threshold_cleared`
(already bridged; candidate FLG_STEP_ONET 750).
Guardian: the Malady (shipped).
Fragment: *"The sound of your name, said once, by someone who had never heard it
before. Every copy since has been quoting."*
Track 1: the wake-up theme reprise.

### 2. The Intake Ledger — Postwick, beneath the Registry
EB: Lilliput Steps / FLG_WIN_LLPT_BOSS (191). Story flag:
`source:intake-ledger:cleared` (candidate FLG_STEP_HAPPY 743).
Site: a records room under the Registry. Postwick's FIRST intake book, open on a
stand: handwriting, crossed-out lines, a coffee ring. Provenance as human error.
Guardian: **The Notary** — a stamp-arm apparatus that files the party mid-fight
(status-effect gimmick: "FILED" = brief paralysis; timed DEFEND clears it).
Lilliput nod: a procession of tiny stamp-minions circles the ledger.
Fragment: *"A signature that shakes a little. Whoever signed was nervous.
Copies are never nervous."*

### 3. The Source Spring — LSW
EB: Milky Well / FLG_WIN_MLKY_BOSS (193). Story flag: `source:spring:cleared`.
Site: the spring where Little Swag World literally bubbles up (the lore already
names LSW the organic source). Warm light, slow music.
Guardian: **The Bottler** — corrupted vendor capping the spring into numbered
editions ("limited run of everything"). Financial-nihilism fuel. Adds bottled
minions that pop into healing mist when broken (heal-the-boss gimmick the party
can steal by breaking bottles first).
Fragment: *"Water that tastes like the day you first drank it. Not like the
description of the day. The day."*
Beat: after the fight, an EB coffee-break-style slow scroll (the ROM has the
sequence data): the spring talks to Bosch. The mixtape's quiet interlude.

### 4. The Undelivered — Dead Letter outskirts
EB: Rainy Circle / FLG_WIN_RAIN_BOSS (192). Story flag:
`source:undelivered:cleared` (candidate FLG_STEP_PAST 372).
Site: a rain-soaked yard of crates and parcels that never arrived. Every one
still an original, because nobody ever opened it to copy it.
Guardian: **The Return Officer** — stamps RETURN TO SENDER on the party
(mirror of the museum stamp motif; sends one party member "away" for two turns,
EB Departing-Soul style).
Fragment: *"Rain on cardboard. A parcel with your name, never opened. Some
things stay original by staying unread."*

### 5. The Vault of Certificates — under The Galleria
EB: Magnet Hill / FLG_WIN_MGNT_BOSS (194). Story flag: `source:vault:cleared`.
Site: the forgery floor beneath the gallery, where provenance certificates are
printed in sheets. Guillotine cutter, wet ink, a wall of pre-signed authenticity.
Guardian: **The Appraiser** — assigns the party PRICE TAGS mid-fight (your
damage scales down as your "market value" gets written down; break the tag by
landing a timed BASH).
Fragment: *"A price tag on the back of the first frame. Someone once paid for
the real thing with lunch money and meant it."*

### 6. The Broadcast Pier — Solana Beach
EB: Pink Cloud / FLG_WIN_PINK_BOSS (195). Story flag: `source:pier:cleared`
(candidate FLG_STEP_CAPEESTATE 110).
Site: a transmitter tower at the end of the pier, golden hour, the sea full of
signal. Where copies get broadcast out over the water.
Guardian: **The Amplifier** — a PA-system seraph preaching the signal
(network-state spirituality fuel). Echo gimmick: repeats the party's own last
move back at them at 1.5x; silence it with PSI (the one fight where assist PSI
is the star).
Fragment: *"A song heard live, once, before it was uploaded. The crowd breathing
in the quiet parts. No recording kept the breath."*

### 7. The Vacancy Sign — Vacancy Flats
EB: Lumine Hall / FLG_WIN_LUMI_BOSS (196). Story flag: `source:vacancy:cleared`
(candidate FLG_STEP_DSRT 370).
Site: a dead motel strip; one buzzing marquee. Lumine Hall made literal: the
sign displays Bosch's running thought back at him, one word quietly changed
(psy-ops fuel). The player SEES the scrolling text alter mid-sentence.
Guardian: **The Editor** — rewrites its own battle taunts mid-line (bossTaunts
system); every third turn it "revises" a buff off the party.
Fragment: *"Your own thought in your own words with one word changed. You
noticed. The noticing is yours."*

### 8. The First Record — The Unlisted Room
EB: Fire Spring / FLG_WIN_FIRE_BOSS (197). Story flag:
`source:first-record:cleared` (candidate FLG_STEP_MGKT 371).
Site: the room holding the thing Milady copied first. Bare, warm, one object
under one light. The origin of the whole war.
Guardian: **The Master Copy** — the best copy ever made, indistinguishable from
Bosch except it knows it is not him (anonymity fuel: it has no name of its own).
Tragic fight; it uses Bosch's own moveset mirrored. Beating it is the game's
thesis in mechanics: the original wins by being willing to take damage.
Fragment: *"Side B ends early. Where the eighth track should be there is only
your heartbeat. It has been yours the whole time."*
Beat: the Mixtape completes; it plays through; `raid:morningside:active`.

## Implementation spine (per site, the act2-postwick boss recipe)

1. Visible landmark + guardian sprite (boss casting studio; Super Metal Mons
   Gen 2 pool + vault picks).
2. triggers.json boss gate (requireFlags = act spine), win sets the story flag.
3. flag-map raises the EB sanctuary flag (entries below) so vanilla
   FLG_WIN_*_BOSS doors/NPCs react.
4. Attestation (Source Check) moment on clear + fragment dialogue + track grant.
5. Item 196 field-use = replay collected tracks (rename "Original Mixtape").

## Flag-map entries (spec; fire when triggers are authored)

| story flag | EB flag | STEP candidate |
|---|---|---|
| signal:threshold_cleared (live) | 190 FLG_WIN_GIAN_BOSS | 750 FLG_STEP_ONET |
| source:intake-ledger:cleared | 191 FLG_WIN_LLPT_BOSS | 743 FLG_STEP_HAPPY |
| source:spring:cleared | 193 FLG_WIN_MLKY_BOSS | none named |
| source:undelivered:cleared | 192 FLG_WIN_RAIN_BOSS | 372 FLG_STEP_PAST |
| source:vault:cleared | 194 FLG_WIN_MGNT_BOSS | none named |
| source:pier:cleared | 195 FLG_WIN_PINK_BOSS | 110 FLG_STEP_CAPEESTATE |
| source:vacancy:cleared | 196 FLG_WIN_LUMI_BOSS | 370 FLG_STEP_DSRT |
| source:first-record:cleared | 197 FLG_WIN_FIRE_BOSS | 371 FLG_STEP_MGKT |
