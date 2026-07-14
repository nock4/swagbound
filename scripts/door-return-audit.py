#!/usr/bin/env python3
"""Door-return audit: faithful static replica of the runtime door mechanics.

For every door destination, simulates the real player (PLAYER_FOOT_BOX 13x6,
1px-equivalent movement at 2px BFS) over the real collision (world.json
solidRows + collision-overrides clears/solids exactly as applyOverrideRects
maps them) and the real door probe (leading-edge cells at distance 0..1, from
doorTriggers.ts). A landing where NO door in the room is triggerable from any
reachable feet position is a hard-lock room.

Run after `pnpm build:eb-fullworld`. Exits 1 if any player-facing hard-lock
landing exists, so it can gate CI/regression runs.

  python3 scripts/door-return-audit.py [--all]   # default: player-facing only
"""
import json
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "apps/game/public/generated"

# PLAYER_FOOT_BOX (collisionFootprint.ts)
FB_LEFT, FB_RIGHT, FB_TOP, FB_BOTTOM = -7, 6, -6, 0
PROBE_DISTANCE = 1  # doorTriggers.ts probeCells
STEP = 2            # BFS feet-position resolution (px)
BBOX_MARGIN = 480   # px around the landing to bound the room BFS
MAX_POSITIONS = 120_000

world = json.load(open(GEN / "world.json"))
overrides = json.load(open(GEN / "collision-overrides.json"))
coll = world["collision"]
CS, W, H = coll["cellSize"], coll["width"], coll["height"]

# --- build the solid grid exactly as the runtime does -----------------------
solid_rows = [bytearray(row.encode()) for row in coll["solidRows"]]

def apply_rects(rects, value):
    """applyOverrideRects semantics (collisionOverrides.ts)."""
    for rect in rects:
        c0 = max(0, rect["x"] // CS)
        c1 = min(W - 1, (rect["x"] + rect["w"] - 1) // CS)
        r0 = max(0, rect["y"] // CS)
        r1 = min(H - 1, (rect["y"] + rect["h"] - 1) // CS)
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                solid_rows[r][c] = value

apply_rects(overrides.get("clears", []), ord("0"))
apply_rects(overrides.get("solids", []), ord("1"))

def cell_solid(cx, cy):
    return cx < 0 or cy < 0 or cx >= W or cy >= H or solid_rows[cy][cx] == ord("1")

def foot_box_clear(fx, fy):
    """All four foot-box corner cells non-solid (collisionFootprint.ts)."""
    for ox, oy in ((FB_LEFT, FB_TOP), (FB_RIGHT, FB_TOP), (FB_LEFT, FB_BOTTOM), (FB_RIGHT, FB_BOTTOM)):
        if cell_solid((fx + ox) // CS, (fy + oy) // CS):
            return False
    return True

# --- doors -------------------------------------------------------------------
# Runtime parity (doorTriggers.ts): only type "door" warps, and near-self
# destinations (< MESSAGE_DOOR_MAX_SELF_WARP_DISTANCE_PX = 24) are message
# doors / converter-emitted escalator rows, not warps.
def is_warp_door(d):
    dest = d.get("destinationWorldPixel")
    if not dest or d.get("type") != "door":
        return False
    dx = dest["x"] - d["worldPixel"]["x"]
    dy = dest["y"] - d["worldPixel"]["y"]
    return (dx * dx + dy * dy) ** 0.5 >= 24

doors = [d for d in world["doors"] if is_warp_door(d)]
door_cell_set = {}
for d in doors:
    dc = (d["worldPixel"]["x"] // CS, d["worldPixel"]["y"] // CS)
    door_cell_set.setdefault(dc, []).append(d)

def probe_hits_door(fx, fy):
    """Union of the 4-direction probes (xProbeCells/yProbeCells, dist 0..1)."""
    min_x = (fx + FB_LEFT) // CS
    max_x = (fx + FB_RIGHT) // CS
    min_y = (fy + FB_TOP) // CS
    max_y = (fy + FB_BOTTOM) // CS
    for dist in range(0, PROBE_DISTANCE + 1):
        for y in range(min_y, max_y + 1):
            if (max_x + dist, y) in door_cell_set or (min_x - dist, y) in door_cell_set:
                return True
        for x in range(min_x, max_x + 1):
            if (x, max_y + dist) in door_cell_set or (x, min_y - dist) in door_cell_set:
                return True
    return False

def snap_landing(px, py):
    """Faithful replica of resolveWalkableFootprintDestination
    (collisionFootprint.ts): the game's door-arrival placement. Cell-unit
    Chebyshev rings around the destination cell, candidates keep the
    destination's pixel offset, first ring with a clear candidate wins by
    min Euclidean distance (scan order breaks ties)."""
    if foot_box_clear(px, py):
        return (px, py)
    ocx, ocy = px // CS, py // CS
    off_x, off_y = px % CS, py % CS
    for ring in range(1, 9):  # maxRingCells: 8 (chunkedWorldScene.ts)
        best = None
        for dy in range(-ring, ring + 1):
            for dx in range(-ring, ring + 1):
                if max(abs(dx), abs(dy)) != ring:
                    continue
                cx = (ocx + dx) * CS + off_x
                cy = (ocy + dy) * CS + off_y
                if not foot_box_clear(cx, cy):
                    continue
                dist_sq = (cx - px) ** 2 + (cy - py) ** 2
                if best is None or dist_sq < best[2]:
                    best = (cx, cy, dist_sq)
        if best:
            return (best[0], best[1])
    return None

def straight_walk_triggers(start):
    """Model a player holding one arrow key from the landing: pure cardinal
    walks (no lane adjustment). True if any of the 4 walks reaches a probe hit.
    A room that fails this but passes the full BFS is a NARROW-EXIT UX trap:
    escapable, but the obvious approach wedges (this exact shape convinced two
    independent testers a room near spawn was a hard-lock, 2026-07-13)."""
    for dx, dy in ((STEP, 0), (-STEP, 0), (0, STEP), (0, -STEP)):
        fx, fy = start
        for _ in range(0, BBOX_MARGIN // STEP):
            if probe_hits_door(fx, fy):
                return True
            n = (fx + dx, fy + dy)
            if not foot_box_clear(*n):
                break
            fx, fy = n
    return False

def audit_landing(px, py):
    """(status: "OK" | "NARROW-EXIT" | fail-reason, positions_explored)."""
    start = snap_landing(px, py)
    if start is None:
        return "NO-VALID-LANDING", 0
    x0, x1 = px - BBOX_MARGIN, px + BBOX_MARGIN
    y0, y1 = py - BBOX_MARGIN, py + BBOX_MARGIN
    seen = {start}
    q = deque([start])
    reachable_exit = False
    while q:
        fx, fy = q.popleft()
        if probe_hits_door(fx, fy):
            reachable_exit = True
            break
        if len(seen) >= MAX_POSITIONS:
            return "BFS-CAP", len(seen)
        for dx, dy in ((STEP, 0), (-STEP, 0), (0, STEP), (0, -STEP)):
            n = (fx + dx, fy + dy)
            if n in seen or not (x0 <= n[0] <= x1 and y0 <= n[1] <= y1):
                continue
            if foot_box_clear(*n):
                seen.add(n)
                q.append(n)
    if not reachable_exit:
        return "NO-TRIGGERABLE-EXIT", len(seen)
    if not straight_walk_triggers(start):
        return "NARROW-EXIT", len(seen)
    return "OK", len(seen)

# --- spawn reachability filter (player-facing) --------------------------------
def spawn_flood():
    warp_map = {}
    def csolid(cx, cy):
        return cell_solid(cx, cy)
    for d in doors:
        dcx, dcy = d["worldPixel"]["x"] // CS, d["worldPixel"]["y"] // CS
        tx, ty = d["destinationWorldPixel"]["x"] // CS, d["destinationWorldPixel"]["y"] // CS
        dest = None
        for r in range(0, 4):
            for oy in range(-r, r + 1):
                for ox in range(-r, r + 1):
                    if not csolid(tx + ox, ty + oy):
                        dest = (tx + ox, ty + oy)
                        break
                if dest:
                    break
            if dest:
                break
        if not dest:
            continue
        for ox, oy in ((0, 1), (0, -1), (1, 0), (-1, 0), (0, 2), (0, -2), (2, 0), (-2, 0)):
            k = (dcx + ox, dcy + oy)
            if not csolid(*k):
                warp_map.setdefault(k, []).append(dest)
    sx = world["player"]["spawnWorldPixel"]["x"] // CS
    sy = world["player"]["spawnWorldPixel"]["y"] // CS
    seen = {(sx, sy)}
    q = deque([(sx, sy)])
    while q:
        cx, cy = q.popleft()
        for n in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            if n not in seen and not csolid(*n):
                seen.add(n)
                q.append(n)
        for t in warp_map.get((cx, cy), []):
            if t not in seen:
                seen.add(t)
                q.append(t)
    return seen

def main():
    audit_all = "--all" in sys.argv
    reachable = spawn_flood()

    def player_facing(door):
        cx, cy = door["worldPixel"]["x"] // CS, door["worldPixel"]["y"] // CS
        return any((cx + ox, cy + oy) in reachable for r in range(4) for oy in range(-r, r + 1) for ox in range(-r, r + 1))

    landings = {}
    for d in doors:
        dest = d["destinationWorldPixel"]
        key = (dest["x"], dest["y"])
        entry = landings.setdefault(key, {"entrances": [], "playerFacing": False})
        entry["entrances"].append((d["worldPixel"]["x"], d["worldPixel"]["y"]))
        entry["playerFacing"] = entry["playerFacing"] or player_facing(d)

    failures = []
    warnings = []
    inert = []
    checked = 0
    for (px, py), meta in sorted(landings.items()):
        if not audit_all and not meta["playerFacing"]:
            continue
        checked += 1
        status, explored = audit_landing(px, py)
        if status == "NARROW-EXIT":
            warnings.append((px, py, status, explored, meta))
        elif status == "NO-VALID-LANDING":
            # Engine refuses the warp when the landing is unwalkable
            # (applyDoorWarp -> warnInvalidDoorWarp): an inert door, not a trap.
            inert.append((px, py, status, explored, meta))
        elif status != "OK":
            failures.append((px, py, status, explored, meta))

    print(f"landings audited: {checked}/{len(landings)}"
          f" ({'all' if audit_all else 'player-facing only'})")
    print(f"hard-lock landings: {len(failures)}")
    for px, py, reason, explored, meta in failures:
        vias = " ".join(f"({x},{y})" for x, y in meta["entrances"][:3])
        print(f"  landing ({px},{py})  {reason}  explored={explored}  via {vias}"
              f"{' [player-facing]' if meta['playerFacing'] else ''}")
    # Informational tier. High recall, low precision: the 2026-07-13 trap room
    # (landing 7192,392 via door 2016,1704) matches this signature, but so do
    # ~179 benign "land beside the door, sidestep to align" cases that are
    # EB-normal. Not a gate; list with --verbose when hunting a reported trap.
    print(f"narrow-exit landings (escapable; straight-line approach wedges): {len(warnings)}")
    if "--verbose" in sys.argv:
        for px, py, reason, explored, meta in warnings:
            vias = " ".join(f"({x},{y})" for x, y in meta["entrances"][:3])
            print(f"  landing ({px},{py})  {reason}  explored={explored}  via {vias}")
    print(f"inert doors (unwalkable landing; engine refuses the warp): {len(inert)}")
    for px, py, reason, explored, meta in inert:
        vias = " ".join(f"({x},{y})" for x, y in meta["entrances"][:3])
        print(f"  landing ({px},{py})  via {vias}")
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    main()
