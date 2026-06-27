# Drifella 2 Text Corpus 0003 — Full Collection (Metadata Only)

Source: Helius DAS `getAssetsByGroup` against collection `7cHTjqr2S8uUCrG3TVFvFix3vcLjhPiwrtRsAeJtESRj`.
Items pulled: **9,900** (entire Drifella 2 collection — no images downloaded).

## Canonical status

Supersedes the metadata side of `drifella2-text-corpus-0001/` (500-token sample) and `drifella2-text-corpus-0002/`. Those earlier corpora remain valid for their **OCR** (in-image text) records — this corpus is metadata only.

## Files

- `fetch_das.py` — paginated Helius DAS pull. Idempotent re-run safe (overwrites `das-assets.jsonl`).
- `das-assets.jsonl` — raw DAS asset records, one per line (~27 MB).
- `extract_traits.py` — clean dialogue-bearing trait fields, dedupe, count.
- `drifella2-traits.jsonl` — one record per token: `{ token, mint, name, overlay?, background?, mouth?, head?, ... }`. Rarity suffixes `$N` stripped. `none` / `noise*` values dropped.
- `drifella2-phrases.csv` — `(phrase, field, count)` rows, sorted by frequency desc.
- `drifella2-phrases-by-field.json` — same data grouped by field, e.g. `overlay`, `background`, `mouth`.

## Dialogue-bearing fields kept

`background`, `background_plus`, `body`, `cloth`, `mouth`, `head`, `left_hand`, `right_hand`, `eyes`, `nose`, `tattoos`, `accessory`.
Dropped: `noise` (pure visual).

## Numbers at a glance

- 9,900 tokens, 0 skipped
- 1,023 unique phrases across all fields
- Densest fields for dialogue: `overlay` (134 unique), `background` (204), `head` (80), `left_hand` (109), `right_hand` (85), `mouth` (88)
- Note: trait fields capture the *theme* of the visual element. In-image text (e.g. `WAKE UP IT'S 2010!`, `YOU JUST GOT FREAKING FIRED FROM MILADY'S MCDONALDS`) is only in the OCR corpora 0001/0002 — re-run RapidOCR streaming if those become needed.

## Phase 2 — Tagged bark pool (done)

- `tag_phrases.py` adds: `voice` (first_person / imperative / interrogative / declarative / descriptive), `length_bucket`, `cursed` flag, `vibes[]` (vidya, pharma, nft, religion, swag, anime, milady, gun, lore, food, ironic, doomer), and a 0–10 `bark_score`.
- `drifella2-phrases-tagged.jsonl` / `.csv` — every phrase, sorted by bark_score desc.
- `build_bark_pool.py` filters to `bark_score >= 5`, cursed excluded.
- **`drifella2-bark-pool.md`** — browsable: by voice, by vibe, top 50, and vibe-grouped starter sets for archetype NPCs (doomer-vendor, nft paranoiac, vidya-pilled teen, religion-haunted regular, swag-poisoned fit-flexer, anime-cracked).
- `drifella2-bark-pool.json` — machine-readable, 130 barks.
- `drifella2-cursed-pool.json` — 6 phrases gated (slurs / nazi-club content). **Do not ship to public build without per-line review.**

## Phase 3 — NPC assignment (deferred)

Existing NPCs in `swagbound-phaser/src/game/interiors.ts` (`npc-biscuit`, `npc-bonkle`, `npc-sal`, `npc-morrow`) already have narrative roles (Biscuit = grounding witness, Sal = proof-kiosk operator). The story bible only formally defines `former-manager` so far. **Hold on assigning these found-text lines to those specific NPCs** until characterization is locked — see the vibe-grouped starter sets in `drifella2-bark-pool.md` instead, which are archetype-keyed and can be assigned to any NPC matching the archetype.
