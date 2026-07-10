# EB Event-Flag Adoption Map

Nick's directive (2026-07-10): adopt as much of EB's event-flag architecture as
possible, recalibrating the arc/dialogue where needed so Swagbound's beats map
cleanly onto the vanilla flag lattice.

## Why this is high-leverage

The converter carried EB's flag wiring into our world data intact — it has been
sitting dormant:

| Surface | Scale | What the flags do |
|---|---|---|
| `world.json` NPCs | ~250+ flag-gated of 1,582 | appear/disappear per story state (`showSprite` + `eventFlag`) |
| `encounters.json` | ~1,017 flag refs | encounter tables switch per story state |
| `world.json` doors | 1,072 doors, 57 distinct flags | open/close per story state (runtime support NOT built yet — wave 3) |

Runtime support already existed for NPC visibility and encounter gating
(`isNpcVisibleForEventFlags`, `eventFlagSatisfied`, `GameFlags.setNum/isSet`,
numeric flags persisted in saves) — but nothing ever SET a numeric flag.

## The bridge (wave 1, shipped)

`content/flag-map.json` maps our narrative string flags → EB flag ids (canonical
names from ebsrc via `content/rom-truth/event-flags.json`; the build validates
every id-name pair against rom-truth). `GameFlags.set()` raises the mapped EB
flags; aliases back-fill on save restore, so old saves inherit new mappings.

Adopted mappings:

| Story flag | EB flags | Vanilla effect that lights up |
|---|---|---|
| `signal:clique_cleared` | FLG_WIN_FRANK (64) + Shark stand-down set (363/364/365/697/40) | arcade gang NPCs stand down/disappear; 4 encounter gates shift |
| `signal:route_open` | FLG_POLICE_STRONG_DISAPPEAR (450), FLG_ONET_GATEOPEN (105) | police presence changes at the station/gate |
| `signal:threshold_cleared` | FLG_WIN_GIAN_BOSS (190), FLG_ONET_DAYBREAK (422) | 21 NPCs appear for daytime Morningside; sanctuary state |
| `recruit:munch` | FLG_JEFF (14) | 11 encounter gates keyed to the Jeff slot |
| `recruit:cloak` | FLG_POLA (12) | Paula-slot NPC/encounter states |
| `game:complete` | FLG_WIN_GEPPU (71) | the post-victory world: 44 NPCs + 81 encounter gates |

Candidates (documented in flag-map.json, NOT applied until browser-verified):
roadblock cops A–E (289–293), FLG_POLA_GRFD (13), FLG_STEP_ONET (750),
FLG_MYHOME_START (375).

## Proposals for Nick (arc recalibration — beat-sheet checkpoint)

1. **Daybreak = threshold.** EB flips Onett to day via FLG_ONET_DAYBREAK after
   the first sanctuary boss. Proposal: couple our night system to the same beat —
   Morningside dawns when the Malady falls. Night-everywhere becomes
   night-until-threshold in Act 1 (Act 2+ unchanged until we map their flags).
2. **Sanctuary-8 = Attestation anchors.** EB's eight FLG_WIN_*_BOSS flags gate
   doors across the map. Proposal: eight provenance/Source sites in the Swagbound
   arc (Attestation anchors), one per sanctuary flag, giving Acts 2–4 the same
   collect-the-eight spine EB players feel.
3. **PHOTO flags = the Archivist.** 64 PHOTO flags + the Wandering Photographer
   config table (ROM) = a complete feature spec. Reskin: the Archivist, who files
   a moment "as it actually happened" — unfalsifiable records in a world of
   copies. Pure thesis.
4. **MYHOME flags for the opening.** The house cast (mom/dog/phone/Pokey-knock
   states) is flag-driven in EB. Verify semantics, then wire the wake-in-bed
   opening to them so the house behaves like EB's across the whole game.

## Waves

- **Wave 1 (shipped):** bridge + mappings above + tests. Verify: clique beat
  visibly stands the arcade gang down.
- **Wave 2 (Nick checkpoint):** the four proposals above land in the beat sheet;
  dialogue recalibration follows sign-off.
- **Wave 3:** door flag support (1,072 doors incl. FLG_ONET_DOOR_CLOSE x20,
  Threed tunnels, sanctuary doors) — needs care with the collision/isolation
  systems; candidates promoted after browser verification.

## Census tooling

`content/rom-truth/event-flags.json` (728 named flags, from ebsrc). Census used
for this doc: label door/NPC/encounter `eventFlag`s in generated data with
canonical names (see session harness; promote to `scripts/rom-tables/` when the
wave-3 door work starts).
