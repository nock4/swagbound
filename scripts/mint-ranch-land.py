#!/usr/bin/env python3
"""Mint the Mons Ranch land: extend the world map south of y=10240 with new
chunk rows + sectors + collision, then paint the valley-clearing base terrain
from vanilla EB tile art.

Idempotent post-build step (run after build:eb-fullworld, like stamp-buildings).
The vanilla map is 256x320 tiles (8192x10240 px). We extend to 368 tile rows
(11776 px): one black frame chunk row (cy20) + two ranch rows (cy21-22).

Ranch rect: world (2048,10752)-(3584,11776)  [chunks cx4-6, cy21-22]
Arrival pad: top-center; exit gate in the north forest wall.
"""
import json, math, collections
from PIL import Image

ROOT = "apps/game/public/generated"
WORLD = f"{ROOT}/world.json"
CHUNKS = f"{ROOT}/assets/world/chunks"

NEW_HEIGHT_TILES = 368          # 320 + 48 (3 chunk rows)
NEW_CY = (20, 21, 22)
RANCH = dict(x0=2048, y0=10752, x1=3584, y1=11776)
RANCH_AREA_ID = 4242420001      # constant area id for every ranch sector
WALL = 96                       # forest wall band thickness (px)

def load_world():
    with open(WORLD) as f:
        return json.load(f, object_pairs_hook=collections.OrderedDict)

def mint(w):
    if w["mapHeightTiles"] >= NEW_HEIGHT_TILES:
        print("mint: already extended")
        return False
    w["mapHeightTiles"] = NEW_HEIGHT_TILES
    for cy in NEW_CY:
        for cx in range(16):
            w["chunks"].append(collections.OrderedDict([
                ("cx", cx), ("cy", cy),
                ("background", f"assets/world/chunks/background-{cx}-{cy}.png"),
                ("foreground", f"assets/world/chunks/foreground-{cx}-{cy}.png"),
                ("void", False),
            ]))
    s = w["sectors"]
    add_rows = (NEW_HEIGHT_TILES * 32 - 10240) // 128   # 12 sector rows
    s["rows"] += add_rows
    for _ in range(add_rows * 32):
        s["areaIds"].append(RANCH_AREA_ID)
        s["indoor"].append(0)
        s["bounded"].append(0)
        s["coverArt"].append(0)
    c = w["collision"]
    add_cells = (NEW_HEIGHT_TILES * 32 - 10240) // c["cellSize"]  # 192 rows
    c["height"] += add_cells
    c["solidRows"].extend(["1" * c["width"]] * add_cells)
    c["surfaceRows"].extend(["0" * c["width"]] * add_cells)
    w["counts"]["chunks"] = len(w["chunks"])
    print(f"mint: height {w['mapHeightTiles']} tiles, {len(w['chunks'])} chunks, "
          f"{s['rows']} sector rows, {c['height']} collision rows")
    return True

# ---- terrain painting -------------------------------------------------------
GRASS_TONES = {(148, 222, 99), (148, 173, 99), (255, 255, 206)}

def masked_sprite(img, wx, wy, w, h, ox):
    """Extract art as an RGBA sprite. Only grass pixels CONNECTED TO THE BORDER
    are cleared (flood fill), so canopy interiors that share grass tones survive."""
    crop = img.crop((wx - ox, wy - 7168, wx - ox + w, wy - 7168 + h)).convert("RGBA")
    px = crop.load()
    from collections import deque
    seen = set(); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        if tuple(px[x, y][:3]) not in GRASS_TONES:
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return crop

def harvest_tiles():
    """Pull vanilla EB art so the ranch is automatically in-style."""
    v4 = Image.open(f"{CHUNKS}/background-4-14.png").convert("RGB")
    v5 = Image.open(f"{CHUNKS}/background-5-14.png").convert("RGB")
    return {
        "grass":  v5.crop((0, 0, 32, 32)),                          # verified clean (2560,7168)
        "dirt":   v4.crop((2500 - 2048, 7330 - 7168, 2500 - 2048 + 32, 7330 - 7168 + 32)),
        "tree":   masked_sprite(v4, 2457, 7216, 38, 54, 2048),      # north-row tree
        "tree2":  masked_sprite(v4, 2360, 7244, 40, 50, 2048),      # west tree variant
        "bush":   masked_sprite(v4, 2400, 7456, 36, 32, 2048),      # meadow bush (clean grass around)
        "pond":   masked_sprite(v4, 2298, 7358, 96, 48, 2048),     # neighbor pond full bounds
    }

def hash01(x, y):
    return math.modf(math.sin(x * 12.9898 + y * 78.233) * 43758.5453)[0] % 1.0

def vn(s, seed=0):
    def octave(s, wl, sd):
        i = math.floor(s / wl); t = (s / wl) - i
        c = (1 - math.cos(math.pi * t)) / 2
        def h1(k): return (math.modf(math.sin((k + sd) * 127.1 + 311.7) * 43758.5453)[0] % 1.0) * 2 - 1
        return h1(i) * (1 - c) + h1(i + 1) * c
    return 7.0 * octave(s, 26, seed) + 4.0 * octave(s, 61, seed + 9000)

def paint(w):
    tiles = harvest_tiles()
    grass, dirt = tiles["grass"], tiles["dirt"]
    R = RANCH
    # one big RGBA canvas for the three new rows, split into chunks at save time
    Wc, Hc = 8192, 3 * 512
    OY = NEW_CY[0] * 512                      # 10240
    canvas = Image.new("RGBA", (Wc, Hc), (0, 0, 0, 255))

    # 1. grass base across the ranch rect
    for wy in range(R["y0"], R["y1"], 32):
        for wx in range(R["x0"], R["x1"], 32):
            canvas.paste(grass, (wx, wy - OY))

    # 2. dirt yard blob with the EB edge recipe (broken dark outline + olive band)
    yard = dict(cx=2816, cy=11020, rx=290, ry=165)
    OLIVE = (148, 173, 99, 255); DARK = (49, 49, 49, 255)
    px = canvas.load()
    def yard_d(wx, wy):
        dx = (wx - yard["cx"]) / yard["rx"]; dy = (wy - yard["cy"]) / yard["ry"]
        return math.hypot(dx, dy) + vn(math.atan2(dy, dx) * 60, 5) / 34.0
    for wy in range(yard["cy"] - yard["ry"] - 40, yard["cy"] + yard["ry"] + 40):
        for wx in range(yard["cx"] - yard["rx"] - 40, yard["cx"] + yard["rx"] + 40):
            d = yard_d(wx, wy)
            if d < 1.0:
                dp = dirt.getpixel((wx % 32, wy % 32))
                px[wx, wy - OY] = (dp[0], dp[1], dp[2], 255)
                if d > 0.985 and hash01(wx, wy) < 0.65:
                    px[wx, wy - OY] = DARK
            elif d < 1.035 and hash01(wx, wy) < 0.8:
                px[wx, wy - OY] = OLIVE
            elif d < 1.07 and hash01(wx, wy) < 0.3:
                px[wx, wy - OY] = OLIVE

    # 3. gate corridor: a packed-dirt path through the north wall so arrival
    #    reads as a passage, not a void (the black above is the door mouth)
    for wy in range(R["y0"] - 60, R["y0"] + WALL):
        for wx in range(2792, 2856):
            if wy < R["y0"] - 20 and not (2804 < wx < 2844):
                continue                      # narrow to a door mouth at the top
            dp = dirt.getpixel((wx % 32, wy % 32))
            px[wx, wy - OY] = (dp[0], dp[1], dp[2], 255)
    # corridor edge lip
    for wy in range(R["y0"] - 60, R["y0"] + WALL):
        for wx in (2792, 2793, 2854, 2855):
            if wy >= R["y0"] - 20 and hash01(wx, wy) < 0.6:
                px[wx, wy - OY] = DARK

    # 4. forest wall: dense staggered rows, painted top-to-bottom so lower
    #    canopies overlap upper trunks (EB forest look)
    tree, tree2, bush = tiles["tree"], tiles["tree2"], tiles["bush"]
    plants = []
    def wall_row(x0, x1, y, step, seed, gate=None):
        for i, wx in enumerate(range(x0, x1, step)):
            jx = int(hash01(wx, seed) * 14) - 7
            jy = int(hash01(seed, wx) * 10) - 5
            if gate and gate[0] < wx < gate[1]:
                continue
            plants.append((wx + jx, y + jy, tree if (i + seed) % 3 else tree2))
    GATE = (2752, 2880)
    for row in range(3):                                   # north wall, 3 rows deep
        wall_row(R["x0"] - 8, R["x1"] - 24, R["y0"] - 20 + row * 26, 27, row + 1,
                 gate=GATE if row >= 0 else None)
    for row in range(3):                                   # south wall
        wall_row(R["x0"] - 8, R["x1"] - 24, R["y1"] - 110 + row * 26, 27, row + 7)
    for row in range(3):                                   # west + east walls
        for i, wy in enumerate(range(R["y0"] + 40, R["y1"] - 100, 30)):
            jx = int(hash01(wy, row) * 10) - 5
            plants.append((R["x0"] - 6 + row * 28 + jx, wy, tree2 if (i + row) % 2 else tree))
            plants.append((R["x1"] - 70 + row * 28 + jx, wy, tree if (i + row) % 3 else tree2))
    # gate flanking trees (pinch the corridor)
    plants.append((GATE[0] - 44, R["y0"] - 6, tree)); plants.append((GATE[1] + 4, R["y0"] - 6, tree2))

    # 5. sparse interior bushes
    for wy in range(R["y0"] + 190, R["y1"] - 200, 96):
        for wx in range(R["x0"] + 170, R["x1"] - 190, 128):
            if hash01(wx, wy) < 0.26 and yard_d(wx, wy) > 1.12:
                plants.append((wx + int(hash01(wx + 1, wy) * 40), wy + int(hash01(wx, wy + 1) * 30), bush))

    for wx, wy, sp in sorted(plants, key=lambda p: p[1]):  # y-sort: lower rows paint over
        canvas.alpha_composite(sp, (wx, wy - OY))

    # save chunks
    out = canvas.convert("RGB")
    for cy in NEW_CY:
        for cx in range(16):
            tile = out.crop((cx * 512, cy * 512 - OY, cx * 512 + 512, cy * 512 - OY + 512))
            tile.save(f"{CHUNKS}/background-{cx}-{cy}.png")
            Image.new("RGBA", (512, 512), (0, 0, 0, 0)).save(f"{CHUNKS}/foreground-{cx}-{cy}.png")
    print("paint: ranch v2 painted (masked sprites, EB dirt edge, staggered forest)")

def carve_collision(w):
    c = w["collision"]; width = c["width"]; cell = c["cellSize"]
    base_row = 10240 // cell
    R = RANCH
    rows = [list(r) for r in c["solidRows"][base_row:]]
    inner = dict(x0=R["x0"] + WALL, y0=R["y0"] + WALL, x1=R["x1"] - WALL, y1=R["y1"] - WALL)
    for gy in range(len(rows)):
        wy = (base_row + gy) * cell
        for gx in range(width):
            wx = gx * cell
            if inner["x0"] <= wx < inner["x1"] and inner["y0"] <= wy < inner["y1"]:
                rows[gy][gx] = "0"
    # gate corridor through the north wall (aligns with the tree-gap at 2760-2880)
    for wy in range(R["y0"] - 8, R["y0"] + WALL, cell):
        for wx in range(2792, 2856, cell):
            rows[(wy - 10240) // cell][wx // cell] = "0"
    c["solidRows"][base_row:] = ["".join(r) for r in rows]
    print("collision: ranch interior carved, gate corridor open")

ARRIVAL = {"x": 2816, "y": 10856}          # just south of the gate corridor
BARN_STEP = {"x": 2152, "y": 7472}         # in front of the Site E barn door

def wire_doors(w):
    """Barn door -> ranch arrival; ranch gate -> barn step. Idempotent."""
    for d in w["doors"]:
        wp = d.get("worldPixel", {})
        if wp.get("x") == 2152 and wp.get("y") in (7440, 7452):
            d["worldPixel"] = {"x": 2152, "y": 7452}
            d["destinationWorldPixel"] = dict(ARRIVAL)
            d["direction"] = "down"
            d.pop("eventFlag", None)
            d.pop("textPointer", None)
    if not any(d.get("worldPixel", {}).get("y", 0) >= 10240 for d in w["doors"]):
        w["doors"].append(collections.OrderedDict([
            ("type", "door"),
            ("worldPixel", {"x": 2816, "y": 10792}),
            ("destinationWorldPixel", dict(BARN_STEP)),
            ("direction", "down"),
            ("style", 0),
        ]))
    print("doors: barn->ranch + ranch gate->barn wired")

RANCH_SONG = "eaglescliffe"   # the farm's established cue

def extend_sector_music():
    p = f"{ROOT}/sector-music.json"
    try:
        with open(p) as f:
            m = json.load(f, object_pairs_hook=collections.OrderedDict)
    except FileNotFoundError:
        print("sector-music: generated copy missing, skipped")
        return
    target_rows = (NEW_HEIGHT_TILES * 32) // 128
    add = target_rows - m["rows"]
    if add <= 0:
        print("sector-music: already extended")
        return
    m["rows"] = target_rows
    m["song"].extend([RANCH_SONG] * (add * m["cols"]))
    m["indoor"].extend([0] * (add * m["cols"]))
    with open(p, "w") as f:
        json.dump(m, f)
    print(f"sector-music: extended to {target_rows} rows ({RANCH_SONG})")

def main():
    w = load_world()
    minted = mint(w)
    paint(w)
    carve_collision(w)
    wire_doors(w)
    extend_sector_music()
    with open(WORLD, "w") as f:
        json.dump(w, f)
    print("world.json written")

if __name__ == "__main__":
    main()
