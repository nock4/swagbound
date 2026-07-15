# Swagbound Playable Beat Sheet

Historical working beat sheet. It remains useful as a map of the shipped trigger
chain, but its story reveals and terminology are superseded by
`docs/design/canonical-story-architecture.md`. In particular, its early Milady and
Malady reveals are no longer current narrative direction.

Plain-English campaign outline in strict `Bosch is at / sees / gets-fights / learns /
goes next` form, grounded in the live trigger chain (`content/triggers.json`) and the
verified route ledger (`docs/design/story-recovery-route-ledger.md`). It historically
served as the editing checkpoint before runtime dialogue changes. No lore term
appears without a concrete object in the same beat.

Landmarks marked ⚠ are pending the two UNVERIFIED ledger items (house landing,
Act 1→2 road).

## Act 1 — Morningside

### Beat 1: Wake-up
Bosch is at: his bedroom in the family house.
Bosch sees/talks to: the damaged Dox Sheet by the bed/phone; the house pet blocking the front room; the household voice from the cold open.
Bosch gets/fights: picks up the damaged Dox Sheet (key item, gold ◆).
Bosch learns: a cleaner copy of him is already circulating — and holds his face better than he does.
Bosch goes next to: the front step ⚠, down to the road by THE PRECINCT.

### Beat 2: The arcade
Bosch is at: the road corner by SLICE, in front of MONS LINK (the card hall).
Bosch sees/talks to: the Card Clique crowding the machine; one repeatable NPC outside saying the fake Bosch is inside; en route he passed the CAFE, the mailbox, and the town banner.
Bosch gets/fights: fights the Card Clique; the reveal fires.
Bosch learns: the clique doesn't lose, it re-prints — a pre-signed Bosch is already filed.
Bosch goes next to: back up the main street past THE PRECINCT to the billboard, where a line of route aides blocks the road.

### Beat 3: The gate
Bosch is at: the relay gate at the billboard north of THE PRECINCT.
Bosch sees/talks to: the route-aides barrier line; the gate that "has your file open before you clear the doorway."
Bosch gets/fights: fights the Returnless King.
Bosch learns: the gate never needed his face — and the barrier line visibly walks off; the road is open.
Bosch goes next to: straight up the open road toward the humming crossing by the hotel.

### Beat 4: The threshold
Bosch is at: the traffic-light crossing beside the hotel.
Bosch sees/talks to: the threshold posters; the Malady.
Bosch gets/fights: fights the Malady; the mask slips — it's his own face, better-lit.
Bosch learns: the Malady is Milady's edit of him; the antagonist becomes concrete.
Bosch goes next to: a few steps on, where Munch falls in.

### Beat 5: Leaving unprocessed
Bosch is at: the exit desk on the road past the SWAG hotel sign.
Bosch sees/talks to: the clerk offering the clean exit stamp; Munch beside him.
Bosch gets/fights: refuses the stamp, hands back the pen, keeps the damaged Dox Sheet.
Bosch learns: leaving unprocessed is the point — the Sheet is the only thing that survives copying.
Bosch goes next to: out of Morningside toward Postwick ⚠ (road leg unverified).

## Act 2 — Postwick

### Beat 6: Arrival
Bosch is at: the Postwick welcome board (trigger `postwick-arrival`, 2256,7376).
Bosch sees/talks to: the welcome board that already has his name printed on it.
Bosch gets/fights: nothing yet — reads the board.
Bosch learns: Postwick pre-files everyone; his arrival was processed before he arrived.
Bosch goes next to: the Registry doorway, where a figure with a clipboard for a face steps out.

### Beat 7: The Registry
Bosch is at: the Registry doorway (trigger `postwick-registry`, 2300,7308).
Bosch sees/talks to: the Warden with the laminated smile.
Bosch gets/fights: fights the Warden; the clipboard clatters open.
Bosch learns: under the intake form is a standing order — Postwick is kept pre-filed on purpose. (If the Malady Contract Scrap ships, Bosch shows it here and the papers match.)
Bosch goes next to: the Venue, whose lights and announcer are impossible to miss.

### Beat 8: The Venue
Bosch is at: the Venue floor (triggers `arena-venue-1..3`, y 6400).
Bosch sees/talks to: the announcer; three brackets of exhibition fighters.
Bosch gets/fights: fights all three brackets.
Bosch learns: the purse was pre-filed too — CHAMPION, printed before the first bell.
Bosch goes next to: the act-end stage (trigger `postwick-act2-end`), where he leaves the purse on the table and takes the east road toward Dead Letter.

## Act 3 — Dead Letter

### Beat 9: Arrival
Bosch is at: the Dead Letter arrival stretch (trigger `deadletter-arrival`, 4820,8360), east of Postwick where "the road stops pretending."
Bosch sees/talks to: the sorting-town frontage; undelivered selves.
Bosch gets/fights: nothing yet.
Bosch learns: this is where versions that never got delivered end up.
Bosch goes next to: the Museum of Leaked Versions.

### Beat 10: The museum
Bosch is at: the Museum of Leaked Versions (triggers `museum-worm`, `museum-frank`, `museum-starman`).
Bosch sees/talks to: empty frames where originals hung; blank placards; SOURCE: DISPUTED.
Bosch gets/fights: fights the three gallery guardians.
Bosch learns: something ate the firsts and moved into the empty frames.
Bosch goes next to: the museum exit (trigger `deadletter-act3-end`), where Provenance 0 comes apart and the exit stamp on his file flips to RETURN TO SENDER — the one thing that survived the erasure is the damaged Dox Sheet in his pocket.

## Act 4 — Morningside raid

### Beat 11: The return
Bosch is at: occupied Morningside (barrier `raid-morningside-seal`; triggers `raid-morningside-1..3`).
Bosch sees/talks to: walls of identical grinning faces wearing the town's stolen faces.
Bosch gets/fights: clears the three swarm cells (plaza, storefront, block).
Bosch learns: the swarm is every stolen face in town, stacked.
Bosch goes next to: the empty plaza.

### Beat 12: Milady
Bosch is at: the plaza (trigger `milady-final`, 1796,1290).
Bosch sees/talks to: the last thing standing — not a face, not a mask.
Bosch gets/fights: the final fight, Dox Sheet in his fist.
Bosch learns: the only thing that survives being copied is the thing that refused to be improved.
Bosch goes next to: nowhere. He smooths the Sheet flat and keeps it in his pocket, where originals go. (`game:complete`)

---

## EB flag mapping annex (2026-07-10 directive: map the arc onto the vanilla flag lattice)

Each beat now raises real EarthBound event flags via `content/flag-map.json`
(see docs/design/eb-flag-map.md for the machinery). What that changes on screen:

- **Beat 2 (arcade)** sets FLG_WIN_FRANK + the Shark stand-down flags: the
  cat-hat gang around MONS LINK visibly disperses after the fight, and four
  encounter tables shift. The neighborhood itself says "you won."
- **Beat 3 (gate)** sets FLG_POLICE_STRONG_DISAPPEAR + FLG_ONET_GATEOPEN on top
  of our barrier despawn.
- **Beat 4 (threshold)** sets FLG_WIN_GIAN_BOSS + FLG_ONET_DAYBREAK — 21 daytime
  NPCs appear. **PROPOSAL 1:** couple the night system to this beat: Morningside
  dawns when the Malady falls (EB's exact structure).
- **Beat 4→5 (Munch)** sets FLG_JEFF; **Beat 6-arc (Cloak)** sets FLG_POLA.
- **Beat 12 (Milady)** sets FLG_WIN_GEPPU — EB's post-victory world state: 44
  NPCs and 81 encounter gates flip for the ending walk.

**PROPOSAL 2 — Sanctuary-8 as Attestation anchors:** EB's eight FLG_WIN_*_BOSS
flags gate doors across the whole map. Give Acts 2–4 eight provenance/Source
sites, one per flag, restoring EB's collect-the-eight spine inside the
Swagbound thesis.

**PROPOSAL 3 — the Archivist:** 64 PHOTO flags + the Wandering Photographer ROM
table = a complete feature spec. The Archivist appears at the ROM's photo spots
and files each moment "as it actually happened" — the only unfalsifiable record
in a world of copies.

**PROPOSAL 4 — MYHOME opening:** wire the wake-in-bed opening to EB's house-cast
flags (mom/phone/knock states) once their semantics are browser-verified, so
Bosch's house behaves like a real EB house for the whole game.
