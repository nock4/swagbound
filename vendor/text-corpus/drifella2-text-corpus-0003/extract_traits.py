#!/usr/bin/env python3
"""Extract dialogue-bearing trait phrases from das-assets.jsonl.

Outputs:
  drifella2-traits.jsonl   one record per token with cleaned trait fields
  drifella2-phrases.csv    one row per (phrase, field) pair with frequency
  drifella2-phrases-by-field.json   grouped phrase counts per field
"""
import csv, json, re
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
ASSETS = HERE / "das-assets.jsonl"
OUT_TRAITS = HERE / "drifella2-traits.jsonl"
OUT_PHRASES_CSV = HERE / "drifella2-phrases.csv"
OUT_PHRASES_JSON = HERE / "drifella2-phrases-by-field.json"

DIALOGUE_FIELDS = {
    "1background": "background",
    "2background+": "background_plus",
    "3drifellabody": "body",
    "4tattoos": "tattoos",
    "5cloth": "cloth",
    "6accesory": "accessory",
    "7mouth": "mouth",
    "8nose": "nose",
    "9eyes": "eyes",
    "91head": "head",
    "92left": "left_hand",
    "93right": "right_hand",
    "94overlay": "overlay",
}

NOISE_VALUES = {"none", "noise1", "noise2", "noise3", ""}
TOKEN_RE = re.compile(r"#(\d+)")
RARITY_SUFFIX_RE = re.compile(r"\$\d+\s*$")


def clean_value(raw):
    if raw is None:
        return None
    s = str(raw)
    s = RARITY_SUFFIX_RE.sub("", s).strip()
    return s or None


def main():
    per_field_counter = defaultdict(Counter)
    pair_counter = Counter()
    rows = []
    skipped = 0

    with ASSETS.open() as fin, OUT_TRAITS.open("w") as fout:
        for line in fin:
            d = json.loads(line)
            md = d.get("content", {}).get("metadata", {}) or {}
            name = md.get("name") or ""
            m = TOKEN_RE.search(name)
            token = int(m.group(1)) if m else None
            attrs = md.get("attributes") or []
            cleaned = {}
            for a in attrs:
                trait_type = a.get("trait_type")
                short = DIALOGUE_FIELDS.get(trait_type)
                if not short:
                    continue
                v = clean_value(a.get("value"))
                if not v or v.lower() in NOISE_VALUES:
                    continue
                cleaned[short] = v
                per_field_counter[short][v] += 1
                pair_counter[(v, short)] += 1
            if not cleaned:
                skipped += 1
                continue
            rec = {"token": token, "mint": d.get("id"), "name": name, **cleaned}
            fout.write(json.dumps(rec, ensure_ascii=False) + "\n")
            rows.append(rec)

    with OUT_PHRASES_CSV.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["phrase", "field", "count"])
        for (phrase, field), n in pair_counter.most_common():
            w.writerow([phrase, field, n])

    grouped = {field: counter.most_common() for field, counter in per_field_counter.items()}
    with OUT_PHRASES_JSON.open("w") as f:
        json.dump(grouped, f, ensure_ascii=False, indent=2)

    total_tokens = len(rows)
    total_unique_phrases = len({p for (p, _) in pair_counter})
    print(f"tokens processed:     {total_tokens}")
    print(f"tokens skipped:       {skipped}")
    print(f"unique phrases:       {total_unique_phrases}")
    print(f"unique (phrase,field): {len(pair_counter)}")
    print()
    print("Per-field unique counts:")
    for field in sorted(per_field_counter):
        print(f"  {field:20s} {len(per_field_counter[field]):5d}")


if __name__ == "__main__":
    main()
