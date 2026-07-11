#!/usr/bin/env python3
"""Analyze eb-trace.csv from the Snes9x Lua harness into behavioral ground truth:
walk px/frame (cardinal + diagonal), HP roll digits/frame, text chars/sec per speed
setting, and enemy turn cadence. Compare against content/rom-truth/*.json.
Run: python3 tools/ram-trace/analyze.py [eb-trace.csv]
"""
import csv, sys, json, statistics as st
path = sys.argv[1] if len(sys.argv) > 1 else "tools/ram-trace/eb-trace.csv"
rows = list(csv.DictReader(open(path)))
if not rows:
    print("empty trace"); sys.exit(0)

# --- walk speed: per-frame |dx|+|dy| while moving, split cardinal vs diagonal by facing ---
deltas = {"cardinal": [], "diagonal": []}
for a, b in zip(rows, rows[1:]):
    dx = int(b["px"]) - int(a["px"]); dy = int(b["py"]) - int(a["py"])
    d = (dx*dx + dy*dy) ** 0.5
    if 0 < d < 6:  # a real step (ignore warps/teleports)
        (deltas["diagonal"] if dx and dy else deltas["cardinal"]).append(round(d, 3))
for k, v in deltas.items():
    if v:
        print(f"walk {k}: median {st.median(v):.3f} px/frame  (n={len(v)})  -> px/sec ~ {st.median(v)*60:.1f}")

# --- HP roll: consecutive frames where enemyA_hp changes; digits/frame ---
rolls = [abs(int(b["enemyA_hp"]) - int(a["enemyA_hp"])) for a, b in zip(rows, rows[1:])
         if a["enemyA_hp"] != b["enemyA_hp"] and abs(int(b["enemyA_hp"]) - int(a["enemyA_hp"])) < 500]
if rolls:
    print(f"HP roll: median {st.median(rolls)} hp/frame over {len(rolls)} rolling frames")

# --- text speed: frames the prompt-blink / inputlock is active per setting ---
by_speed = {}
for r in rows:
    by_speed.setdefault(r["textspeed"], 0)
    by_speed[r["textspeed"]] += 1
print("text-speed setting frame counts:", by_speed, "(1 fast / 2 med / 3 slow)")

# --- compare to rom-truth ---
try:
    mv = json.load(open("content/rom-truth/movement-speeds.json"))
    print("rom-truth cardinal[normal] px/frame:", [c["pxPerFrame"] for c in mv["cardinal"][:5]])
    hp = json.load(open("content/rom-truth/hp-meter-speeds.json"))
    print("rom-truth hp roll digits/frame:", [s["digitsPerFrame"] for s in hp["speeds"]])
except FileNotFoundError:
    pass
