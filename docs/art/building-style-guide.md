# Building style guide (EarthBound design language)

Any NEW building or large structure sprite must read as a sibling of the map's
existing buildings. Canon references (cropped from the live map, 2x):

- `docs/regen-style/canon-buildings/canon-home.png` - Bosch's home (the suburban
  house language; the reference for anything residential/rural, incl. the farm barn)
- `docs/regen-style/canon-buildings/canon-hotel-pair.png` - SWAG HOTEL + pale
  neighbor (the town/storefront language)

## The rules (all mandatory)

1. **Projection / CAMERA (the rule that gets missed)**: the camera is ELEVATED,
   looking down at ~3/4. Every building shows the TOP SURFACE of its roof as a
   large flat plane ABOVE the facade: full building width, roughly 30-40% of the
   building's height (measure the canon home: ~0.3), ridge running LEFT-RIGHT.
   Gable triangles may appear only on the SIDE wall. An eye-level elevation
   (thin roof strip, or a front-facing A-frame gable as the dominant face) is an
   automatic kill. The roof planes are flat color (2 shades + ridge highlight),
   never textured, never in perspective.
2. **Surface discipline**: large flat color areas. 2-3 shades per material.
   NO texture noise (no wood grain, no brick noise beyond simple coursing like
   the hotel's).
3. **Palette**: cheerful, slightly pastel, in the family of the canon refs.
   Outlines are the map's dark outline color (sample it from the refs), one
   consistent weight.
4. **Vocabulary**: doors and windows are simple rectangles with thick plain
   frames. Door height matches the 24px character (a character must plausibly
   walk through). Decorative extras follow EB's kit: awnings, chimneys, simple
   signs painted flat.
5. **Scale**: buildings are 80-160 display px tall next to 24px characters.

## The gate (before anything ships or is shown)

Every candidate is composited AT NATIVE SCALE next to a canon reference and
into its actual map spot, then checked: palette <= ~14 colors, outline color
matches neighbors, roof reads as flat planes, door fits the character ruler.
Candidates that fail are killed at the gate, not caveated.

Pipeline: generate via the building-regen pipeline (GPT Image 2 / image_gen)
CONDITIONED on the canon crops, not on style words alone.
