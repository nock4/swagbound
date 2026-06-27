#!/usr/bin/env python3
"""Produce a browsable NPC-bark-pool markdown from tagged phrases.

Input:  drifella2-phrases-tagged.jsonl
Output: drifella2-bark-pool.md
        drifella2-bark-pool.json   (machine-readable, cursed-excluded)
        drifella2-cursed-pool.json (separate, gated)
"""
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
IN_JSONL = HERE / "drifella2-phrases-tagged.jsonl"
OUT_MD = HERE / "drifella2-bark-pool.md"
OUT_JSON = HERE / "drifella2-bark-pool.json"
OUT_CURSED = HERE / "drifella2-cursed-pool.json"

MIN_BARK_SCORE = 5  # phrases below this are noun-phrase descriptors, not bark material


def main():
    records = [json.loads(line) for line in IN_JSONL.open()]
    barks = [r for r in records if not r["cursed"] and r["bark_score"] >= MIN_BARK_SCORE]
    cursed = [r for r in records if r["cursed"]]

    by_voice = defaultdict(list)
    by_vibe = defaultdict(list)
    for r in barks:
        by_voice[r["voice"]].append(r)
        for v in r["vibes"]:
            by_vibe[v].append(r)
        if not r["vibes"]:
            by_vibe["_no_vibe"].append(r)

    def sort_pool(pool):
        return sorted(pool, key=lambda r: (-r["bark_score"], -r["total_count"], r["phrase"]))

    lines = []
    lines.append("# Drifella 2 NPC Bark Pool")
    lines.append("")
    lines.append(f"Source: `drifella2-phrases-tagged.jsonl` ({len(records)} unique phrases).")
    lines.append(f"Filter: `bark_score >= {MIN_BARK_SCORE}`, cursed excluded.")
    lines.append(f"Usable bark candidates: **{len(barks)}**. Cursed (gated): {len(cursed)}.")
    lines.append("")
    lines.append("Lines are unedited from the Drifella 2 trait metadata. Drop into NPC mouths verbatim — typos, weird caps, broken grammar are part of the texture.")
    lines.append("")
    lines.append("## Index")
    lines.append("- [By voice](#by-voice)")
    lines.append("- [By vibe](#by-vibe)")
    lines.append("- [Top 50 punchlines](#top-50-punchlines)")
    lines.append("- [Suggested per-NPC starter sets](#suggested-per-npc-starter-sets)")
    lines.append("- [Cursed gate](#cursed-gate)")
    lines.append("")

    lines.append("## By voice")
    lines.append("")
    voice_order = ["first_person", "imperative", "interrogative", "declarative"]
    for v in voice_order:
        pool = sort_pool(by_voice.get(v, []))
        if not pool:
            continue
        lines.append(f"### `{v}` ({len(pool)})")
        lines.append("")
        for r in pool:
            tags = " ".join(f"#{t}" for t in r["vibes"]) or ""
            lines.append(f"- `{r['phrase']}`  — score {r['bark_score']}, x{r['total_count']} {tags}".rstrip())
        lines.append("")

    lines.append("## By vibe")
    lines.append("")
    vibe_order = sorted(by_vibe.keys(), key=lambda k: (-len(by_vibe[k]), k))
    for v in vibe_order:
        pool = sort_pool(by_vibe[v])
        if not pool:
            continue
        label = v if v != "_no_vibe" else "(untagged)"
        lines.append(f"### `{label}` ({len(pool)})")
        lines.append("")
        for r in pool[:40]:
            lines.append(f"- `{r['phrase']}`  ({r['voice']}, score {r['bark_score']})")
        if len(pool) > 40:
            lines.append(f"- _…and {len(pool) - 40} more_")
        lines.append("")

    top50 = sort_pool(barks)[:50]
    lines.append("## Top 50 punchlines")
    lines.append("")
    lines.append("Hand-picking start here.")
    lines.append("")
    for r in top50:
        tags = " ".join(f"#{t}" for t in r["vibes"]) or ""
        lines.append(f"- `{r['phrase']}` — _{r['voice']}_ {tags}".rstrip())
    lines.append("")

    lines.append("## Suggested per-NPC starter sets")
    lines.append("")
    lines.append("These are vibe-matched suggestions, **not** committed canon. NPC characterization in `story-bible.json` is sparse for these characters; pick what fits once roles are finalized.")
    lines.append("")
    suggestions = {
        "doomer-vendor / femcel kiosk operator": ["doomer", "ironic", "pharma"],
        "nft paranoiac": ["nft", "ironic"],
        "vidya-pilled teen": ["vidya", "ironic"],
        "religion-haunted regular": ["religion", "doomer"],
        "swag-poisoned fit-flexer": ["swag", "ironic"],
        "anime/manga-cracked": ["anime", "vidya"],
    }
    for label, vibes in suggestions.items():
        pool = []
        for r in barks:
            if any(v in r["vibes"] for v in vibes):
                pool.append(r)
        pool = sort_pool(pool)[:10]
        lines.append(f"### {label}")
        for r in pool:
            lines.append(f"- `{r['phrase']}`")
        lines.append("")

    lines.append("## Cursed gate")
    lines.append("")
    lines.append(f"{len(cursed)} phrases flagged as cursed (slurs / hard-edge content). Stored in `drifella2-cursed-pool.json` for offline reference only — **do not ship to a public build**.")
    lines.append("")
    for r in sorted(cursed, key=lambda r: -r["total_count"]):
        lines.append(f"- `{r['phrase']}`")
    lines.append("")

    OUT_MD.write_text("\n".join(lines))

    OUT_JSON.write_text(json.dumps({
        "schema": "swagbound.drifella2.bark-pool.v1",
        "source": "asset-lab/text-extraction/drifella2-text-corpus-0003",
        "minBarkScore": MIN_BARK_SCORE,
        "count": len(barks),
        "barks": sort_pool(barks),
    }, ensure_ascii=False, indent=2))

    OUT_CURSED.write_text(json.dumps({
        "schema": "swagbound.drifella2.bark-pool.cursed.v1",
        "warning": "Do not ship to public build without explicit per-line review.",
        "count": len(cursed),
        "barks": sorted(cursed, key=lambda r: -r["total_count"]),
    }, ensure_ascii=False, indent=2))

    print(f"wrote {len(barks)} barks -> {OUT_MD}")
    print(f"wrote {len(barks)} barks -> {OUT_JSON}")
    print(f"wrote {len(cursed)} cursed -> {OUT_CURSED}")


if __name__ == "__main__":
    main()
