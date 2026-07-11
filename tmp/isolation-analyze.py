#!/usr/bin/env python3
"""Pixel analysis for the interior isolation census: for each resolved interior
site, everything on screen OUTSIDE the room rect must be near-black (HUD text
rows excluded). Emits the defect list with violation fractions."""
import json
from PIL import Image

LEDGER = "tmp/isolation-census.json"
NEAR_BLACK = 26        # per-channel tolerance
HUD_TOP = 46           # exclude stamp/prompt rows
HUD_BOTTOM = 30        # exclude menu-hint row
VIOLATION_FRAC = 0.002 # >0.2% bright outside pixels = defect

ledger = json.load(open(LEDGER))
defects, unresolved = [], []
for e in ledger:
    if not e.get("resolved") or not e.get("isInterior"):
        unresolved.append(e)
        continue
    im = Image.open(e["shot"]).convert("RGB")
    w, h = im.size
    zoom = e["cam"]["zoom"]
    rx = (e["rect"]["x"] - e["cam"]["x"]) * zoom
    ry = (e["rect"]["y"] - e["cam"]["y"]) * zoom
    rw = e["rect"]["width"] * zoom
    rh = e["rect"]["height"] * zoom
    px = im.load()
    bad = total = 0
    sample = None
    for y in range(HUD_TOP, h - HUD_BOTTOM, 2):
        for x in range(0, w, 2):
            inside = rx <= x < rx + rw and ry <= y < ry + rh
            if inside:
                continue
            total += 1
            r, g, b = px[x, y]
            if r > NEAR_BLACK or g > NEAR_BLACK or b > NEAR_BLACK:
                bad += 1
                if sample is None:
                    sample = [x, y, r, g, b]
    frac = bad / total if total else 0
    if frac > VIOLATION_FRAC:
        defects.append({"i": e["i"], "x": e["x"], "y": e["y"], "frac": round(frac, 4), "sample": sample, "shot": e["shot"]})

print(json.dumps({
    "sites": len(ledger),
    "unresolvedOrExterior": len(unresolved),
    "unresolvedSample": [{"i": u["i"], "x": u["x"], "y": u["y"], "resolved": u["resolved"], "isInterior": u.get("isInterior")} for u in unresolved[:10]],
    "pixelDefects": len(defects),
    "defects": defects[:20]
}, indent=1))
