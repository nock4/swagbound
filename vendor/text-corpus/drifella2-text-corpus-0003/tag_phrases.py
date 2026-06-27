#!/usr/bin/env python3
"""Tag dialogue-bearing trait phrases for NPC bark suitability.

Input:  drifella2-phrases.csv (phrase, field, count)
Output: drifella2-phrases-tagged.jsonl
        drifella2-phrases-tagged.csv  (flat, for spreadsheet eyeballing)

Heuristic tags (no model calls):
- length_bucket: short (<=3 words), medium (4-8), long (9+)
- voice:        first_person | imperative | interrogative | declarative | descriptive
- cursed:       true if phrase contains a slur or edgy hard-flag string
- vibes:        list[str] from a small vocabulary (vidya, pharma, nft, religion,
                swag, anime, pokemon, milady, gun, lore, drug, food, ironic)
- bark_score:   simple heuristic 0..10 — higher = better drop-in NPC line
"""
import csv, json, re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
IN_CSV = HERE / "drifella2-phrases.csv"
OUT_JSONL = HERE / "drifella2-phrases-tagged.jsonl"
OUT_CSV = HERE / "drifella2-phrases-tagged.csv"

WORD_RE = re.compile(r"[a-z0-9']+")
FIRST_PERSON = {"i", "im", "me", "my", "mine", "myself", "ive", "ill", "id"}
SECOND_PERSON = {"you", "your", "youre", "youve", "yall", "ya"}
IMPERATIVE_LEADS = {
    "wake", "take", "shoot", "kill", "eat", "drink", "stop", "remember", "be",
    "go", "come", "give", "show", "tell", "let", "watch", "look", "hold",
    "break", "buy", "sell", "save", "leave", "fight", "run", "open", "close",
    "touch", "punch", "press", "play", "die", "burn", "bring", "stay", "wait",
    "find", "follow", "drop", "pick", "use", "make", "try", "send", "shut",
    "honor", "pray", "choose", "revive", "destroy",
}

CURSED_TOKENS = {
    "fag", "faggot", "retarded", "retard", "nigga", "nigger",
}
CURSED_PHRASES = {
    "bored ape nazi club", "based retard gang", "nazi zombies", "nazi club",
}

VIBE_KEYWORDS = {
    "vidya": {"fortnite", "pokemon", "yugioh", "yu-gi-oh", "pkmn", "rpg", "minecraft",
              "playstation", "nintendo", "xbox", "runescape", "warzone", "cod",
              "call of duty", "black ops", "ops", "mario", "zelda", "console", "dratini",
              "dragonite", "yoshi", "yoshis", "kirby", "gameboy", "ds", "switch",
              "controller", "save", "respawn", "boss", "level", "hp", "exp", "xp",
              "speed run", "speedrun", "tournament", "cheat code", "geek", "geeked",
              "hp", "summon", "duel disk", "card", "deck", "energy", "psychic",
              "moogle", "sprite", "matrix", "lavender town", "umbreon", "ghastly",
              "mewtwo", "charizard", "shadow", "shock", "blast", "fang", "stat",
              "drag", "shoot", "rifle", "headshot", "monkey bomb", "packapunch",
              "spngebob", "spongebob", "fairy", "magic", "wizard", "mage"},
    "pharma": {"opium", "fentanyl", "perc", "perc30", "perc 30", "lean", "xanax", "xan",
               "ibuprofen", "tylenol", "advil", "nsaid", "tablet", "pill", "pills",
               "elfbar", "vape", "nicotine", "xylazine", "xylazi", "drug", "drugs",
               "weed", "ganja", "cannabis", "blunt", "joint", "addict", "rehab"},
    "nft": {"nft", "nfts", "monkey", "ape", "ape club", "swag", "swagtoshi", "btc",
            "solana", "eth", "ethereum", "crypto", "liquidated", "rug", "rugpull",
            "wallet", "blockchain", "mint", "discord", "twitter", "x.com", "trade",
            "trader", "altcoin", "shitcoin", "coin", "token", "airdrop", "drain",
            "fud", "fomo", "gm", "ngmi", "wagmi", "pumping", "dumped"},
    "religion": {"jesus", "god", "lord", "pray", "praying", "prayer", "priest", "church",
                 "graveyard", "graveyards", "monk", "burning monk", "father", "honor thy",
                 "demon", "demons", "angel", "hell", "heaven", "milady", "amen",
                 "communion", "bible", "saint"},
    "swag": {"swag", "drip", "fit", "fits", "hoodie", "tee", "shirt", "shoes",
             "jacket", "jersey", "hat", "cap", "puffer", "bape", "supreme",
             "vetements", "vivienne westwood", "westwood", "chrome hearts", "margiela",
             "cdg", "comme des garcons", "vetement", "rodman", "kanye",
             "fashion", "outfit", "stitch", "stitched"},
    "anime": {"anime", "junko", "wojak", "shinji", "evangelion", "eva", "akira",
              "bleach", "naruto", "berserk", "griffith", "miyazaki", "ghibli",
              "manga", "chibi", "kawaii", "senpai", "katana", "weeb", "weebs",
              "wolf knight"},
    "milady": {"milady", "miladys", "mifella", "mcdonalds"},
    "gun": {"gun", "guns", "assault rifle", "rifle", "shotgun", "ar15", "ak47",
            "ar-15", "ak-47", "pistol", "glock", "glockette", "bullet", "bullets",
            "ammo", "round", "rounds", "trigger", "shoot", "shooter"},
    "lore": {"drifella", "lsw", "little swag world", "little swag",
             "swagbound", "tojiba", "bosch", "biscuit", "sal", "morrow", "bonkle",
             "swagtoshi nakamoto"},
    "drug": set(),  # kept empty; pharma supersedes
    "food": {"biscuit", "milk", "burger", "fries", "pizza", "chicken wing",
             "hashbrown", "hash brown", "candy", "cake", "birthday cake",
             "muffin", "muffins", "perc 30 sandwich", "perc30"},
    "ironic": {"based", "ironic", "lol", "lmao", "lmfao", "tomfoolery", "yuh"},
    "doomer": {"doom", "doomer", "death", "die", "dying", "dead", "depression",
               "femcel", "incel", "ngmi", "cope", "rope", "kms", "kys", "darkness",
               "pain", "suffer", "tears", "cry", "lonely", "alone", "no love",
               "deep web", "void", "nihil"},
}


def normalize_words(phrase):
    return WORD_RE.findall(phrase.lower())


def detect_voice(phrase, words):
    if not words:
        return "descriptive"
    if "?" in phrase or phrase.lower().startswith(("are you", "what", "why", "how", "who", "where", "when", "do you", "is this", "is it")):
        return "interrogative"
    first = words[0]
    has_first = any(w in FIRST_PERSON for w in words)
    has_second = any(w in SECOND_PERSON for w in words)
    if first in IMPERATIVE_LEADS or first in {"dont", "don't"}:
        return "imperative"
    if first == "im" or first == "i" or (has_first and len(words) >= 3):
        return "first_person"
    if has_second and len(words) >= 3:
        return "declarative"
    if len(words) <= 3:
        return "descriptive"
    return "declarative"


def detect_cursed(phrase, words):
    low = phrase.lower()
    if any(p in low for p in CURSED_PHRASES):
        return True
    if any(w in CURSED_TOKENS for w in words):
        return True
    return False


def detect_vibes(phrase, words):
    low = phrase.lower()
    hits = []
    for vibe, keywords in VIBE_KEYWORDS.items():
        if not keywords:
            continue
        for kw in keywords:
            if " " in kw:
                if kw in low:
                    hits.append(vibe)
                    break
            else:
                if kw in words:
                    hits.append(vibe)
                    break
    return hits


def length_bucket(words):
    n = len(words)
    if n <= 3:
        return "short"
    if n <= 8:
        return "medium"
    return "long"


def bark_score(phrase, words, voice, cursed, vibes, count):
    """Heuristic 0..10."""
    if cursed:
        return 0
    s = 0
    if voice == "first_person":
        s += 4
    elif voice == "imperative":
        s += 4
    elif voice == "interrogative":
        s += 3
    elif voice == "declarative":
        s += 2
    if 4 <= len(words) <= 12:
        s += 3
    elif len(words) <= 3:
        s += 0
    elif len(words) <= 18:
        s += 1
    if vibes:
        s += min(2, len(vibes))
    if count >= 30:
        s += 1
    return min(s, 10)


def main():
    records = []
    seen = {}  # phrase -> {fields, total_count}
    with IN_CSV.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            phrase = row["phrase"]
            field = row["field"]
            count = int(row["count"])
            entry = seen.setdefault(phrase, {"fields": [], "total": 0})
            entry["fields"].append({"field": field, "count": count})
            entry["total"] += count

    for phrase, info in seen.items():
        words = normalize_words(phrase)
        voice = detect_voice(phrase, words)
        cursed = detect_cursed(phrase, words)
        vibes = detect_vibes(phrase, words)
        score = bark_score(phrase, words, voice, cursed, vibes, info["total"])
        records.append({
            "phrase": phrase,
            "fields": info["fields"],
            "total_count": info["total"],
            "word_count": len(words),
            "length_bucket": length_bucket(words),
            "voice": voice,
            "cursed": cursed,
            "vibes": vibes,
            "bark_score": score,
        })

    records.sort(key=lambda r: (-r["bark_score"], -r["total_count"], r["phrase"]))

    with OUT_JSONL.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with OUT_CSV.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["phrase", "voice", "length", "cursed", "vibes", "score", "total_count", "field_count"])
        for r in records:
            w.writerow([
                r["phrase"], r["voice"], r["length_bucket"],
                "Y" if r["cursed"] else "",
                "|".join(r["vibes"]),
                r["bark_score"], r["total_count"],
                len(r["fields"]),
            ])

    voice_counts = Counter(r["voice"] for r in records)
    cursed_count = sum(1 for r in records if r["cursed"])
    high_bark = sum(1 for r in records if r["bark_score"] >= 7)
    print(f"unique phrases: {len(records)}")
    print(f"cursed:         {cursed_count}")
    print(f"score >= 7:     {high_bark}")
    print(f"score >= 5:     {sum(1 for r in records if r['bark_score'] >= 5)}")
    print()
    print("Voice breakdown:")
    for v, n in voice_counts.most_common():
        print(f"  {v:14s} {n}")
    print()
    print("Top 20 bark candidates (cursed excluded):")
    for r in records[:20]:
        vibes = "/".join(r["vibes"]) or "-"
        print(f"  [{r['bark_score']}] {r['voice']:13s} {vibes:30s} {r['phrase']}")


if __name__ == "__main__":
    main()
