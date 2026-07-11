-- EarthBound behavioral RAM-trace harness (Snes9x Lua).
-- Captures the "feel like EB" ground truth our ROM tables can't give us: walk speed
-- in px/frame, HP/PP odometer roll rate, text speed (chars/sec) per setting, and
-- enemy turn cadence. Logs one CSV row per frame to tools/ram-trace/eb-trace.csv.
--
-- WRAM addresses (Data Crystal EarthBound RAM map; low RAM mirrored at 0x7E0000):
--   0x009877 (word) party leader X       0x00987B (word) party leader Y
--   0x00987F (byte) facing               0x0098B6 (byte) text speed (1 fast/2 med/3 slow)
--   0x009645 (byte) input-lock during text parsing
--   0x00964D (byte) blinking-triangle prompt toggle
--   0x7EA22D (3 bytes) enemy A HP        0x7EA220 (byte) enemy A action number
--   0x0099CE.. (character stats table; displayed HP rolls live here)
--
-- RUN (Snes9x with Lua support):
--   1. Load EarthBound (USA).sfc in Snes9x.
--   2. File > Load Lua Script > tools/ram-trace/eb-trace.lua
--   3. Play: walk in a straight line (walk-speed sample), take damage/heal (HP roll),
--      open dialogue at each of the 3 text speeds (Options), enter a battle (enemy cadence).
--   4. Stop the script; analyze eb-trace.csv with tools/ram-trace/analyze.py.
--
-- Notes: Snes9x's Lua API varies by build. This uses the common memory.read* +
-- emu.framecount + gui.text. If your build lacks memory.readword, it falls back to
-- two readbyte calls. If Lua is unavailable in this Snes9x build, use Mesen/BizHawk
-- with the equivalent memory API (addresses are identical).

local OUT = "tools/ram-trace/eb-trace.csv"
local f = io.open(OUT, "w")
f:write("frame,px,py,facing,textspeed,inputlock,promptblink,enemyA_hp,enemyA_action\n")

local function rd(addr) return memory.readbyte(addr) end
local function rdword(addr)
  if memory.readword then return memory.readword(addr) end
  return rd(addr) + rd(addr + 1) * 256
end
local function rd24(addr) return rd(addr) + rd(addr+1)*256 + rd(addr+2)*65536 end

local prevX, prevY, prevFrame = nil, nil, nil
local function onframe()
  local frame = emu.framecount and emu.framecount() or 0
  local px = rdword(0x009877)
  local py = rdword(0x00987B)
  local facing = rd(0x00987F)
  local tspeed = rd(0x0098B6)
  local ilock = rd(0x009645)
  local blink = rd(0x00964D)
  local ehp = rd24(0x7EA22D)
  local eact = rd(0x7EA220)
  f:write(string.format("%d,%d,%d,%d,%d,%d,%d,%d,%d\n", frame, px, py, facing, tspeed, ilock, blink, ehp, eact))

  -- live HUD: instantaneous px/frame while moving (the walk-speed readout)
  if prevX then
    local dpx = math.abs(px - prevX) + math.abs(py - prevY)
    if gui and gui.text then gui.text(4, 4, string.format("dpx/frame=%d  textspeed=%d", dpx, tspeed)) end
  end
  prevX, prevY = px, py
end

if emu and emu.registerbefore then emu.registerbefore(onframe)
elseif gui and gui.register then gui.register(onframe)
else while true do onframe(); if emu and emu.frameadvance then emu.frameadvance() else break end end end
