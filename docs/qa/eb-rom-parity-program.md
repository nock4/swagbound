# EB ROM Parity Program

Nick (2026-07-11): implement everything from the Data Crystal / ebsrc research EXCEPT
battle-BG distortion (our backgrounds stay). Ground truth extracted from ebsrc (the
MOTHER 2 source recreation) into `content/rom-truth/*.json` — named values, not raw
bytes. Each item = a Codex apply job + orchestrator in-browser verification. Slots
into the overnight run alongside the map sweep.

## Ground truth extracted (done)

| rom-truth file | what | count |
|---|---|---|
| movement-speeds.json | 16.16 px/frame per movement-speed id, cardinal + diagonal | 14 |
| hp-meter-speeds.json | odometer roll rate (int + frac/65536 digits/frame) | 3 |
| swirl-colours.json | battle-entry swirl palette (5-bit RGB) | 5 |
| screen-transitions.json | 12-byte config per transition (duration/fade style/dir/slide/sfx) | 34 |
| timed-delivery.json | Escargo Express / delivery events (sprite, flag, timer, msgs) | 10 |
| condiments.json | base food + condiments that boost it + params | 43 |
| sfx-constants.json | sound-effect id names (for the text-blip pick) | 128 |

Pointer-based data (follow into the ROM during apply): movement patterns
(movement_control_codes_pointer_table.asm), PSI animation (psi_anim_cfg/pointers +
show_psi_animation.asm), swirl patterns (swirl_pointers.asm). ebsrc reference copies
in tmp/ebsrc/ (re-fetchable from Herringway/ebsrc).

## The items (all to implement)

### A. Behavioral "feel like EB" (from ebsrc data; RAM-trace validates)
1. **Walk/movement speeds** — apply movement-speeds.json px/frame to the player +
   NPC movers (currently guessed). Cardinal + diagonal (diagonal ≈ cardinal/√2, EB
   uses exact 0.7071x). Verify: measure player px/frame in-browser vs the table.
2. **HP/PP roll rate** — apply hp-meter-speeds.json to rollingMeter.ts (roll faster
   for bigger deltas: the 3 speeds are delta-magnitude tiers). Verify: frame-count a
   known HP change.

### B. Visual parity
3. **Screen-transition fade styles** — map screen-transitions.json (fade style,
   direction, slide speed, duration, sfx) onto our door/map transition system so each
   door type fades like EB. Verify: screenshot the transition mid-fade per style.
4. **Swirl animation** — apply swirl-colours.json + the swirl_pointers patterns to the
   battle-entry swirl (colors + the spiral pattern), replacing our re-created swirl.

### C. Features
5. **Condiments** — the food+condiment system: a condiment item used on/with its base
   food boosts the heal (condiments.json pairs). Wire into the item-use + battle/field
   effect path; dialogue moment on combine.
6. **Timed delivery (Escargo Express)** — the delivery-man: an item ordered arrives
   after N frames via a delivery NPC (timed-delivery.json: sprite, event flag, timer,
   send/retry messages). Swagbound reskin welcome.
7. **Movement patterns** — authored NPC movement paths from the movement control-code
   table, so key NPCs move on EB-authentic patterns instead of generic wander.
8. **PSI animation** — authentic PSI battle animations (psi_anim data): the flashing
   full-screen PSI effects. Largest effort (compressed graphics + arrangement).

### D. Audio / text
9. **Text-blip SFX** — resolve the open text-blip pitch: EB's dialogue blip is an SFX
   id (sfx-constants.json). Either play the EB blip id (if the SFX is sampleable) or
   pick the closest from our own SFX set and pitch it to match; Nick's ear approves.

### E. Capability
10. **RAM-trace harness** — Snes9x.app is installed (Lua-capable). A Lua script over a
    real EB run captures behavioral ground truth (walk px/frame, text chars/sec per
    speed setting, HP roll rate, enemy turn cadence) from the documented RAM addresses
    (Data Crystal RAM map: 0098B6 text speed, 009877/987B player XY, 0212E6 roll,
    7EA2xx enemy state). Validates items 1/2/9 and future "feel" work. Standalone
    build; running it needs the EB ROM loaded in Snes9x with the Lua console.

## Effort tiers

- **Small, self-contained (do first):** movement speeds (1), HP roll rate (2),
  swirl colours (4-colors), text-blip pick (9).
- **Medium:** screen transitions (3), condiments (5), timed delivery (6),
  swirl patterns (4-patterns), movement patterns (7), RAM-trace harness (10).
- **Large:** PSI animation graphics (8).

## Sequencing into the overnight run

The map sweep + these run as parallel Codex streams with orchestrator verification.
Order: behavioral (1,2) and swirl colours first (cheap, high-confidence), then
transitions + condiments + delivery, then movement patterns + swirl patterns + PSI
anim, with the RAM-trace harness built early to validate the behavioral ones.
Stage every commit by explicit path (never `git add -A`).
