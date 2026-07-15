import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [world, overrides, casting, report] = await Promise.all([
  readJson("apps/game/public/generated/world.json"),
  readJson("apps/game/public/generated/sprite-overrides.json"),
  readJson("content/interior-sprite-casting.json"),
  readJson("apps/game/public/generated/interior-sprite-casting-report.json")
]);

const sectors = world.sectors;
const sectorWidth = sectors.sectorWidthTiles * sectors.tileSize;
const sectorHeight = sectors.sectorHeightTiles * sectors.tileSize;
const imageFor = (npc) => overrides.byNpcId?.[String(npc.npcId)]?.image
  ?? overrides.bySpriteGroup?.[String(npc.spriteGroup)]?.image;
const isLsw = (image) => /\/(?:gns-|promo-)?lsw-/iu.test(image ?? "");
const isMilady = (image) => /(?:milady|malady|midlady|mylady|vilady)/iu.test(image ?? "");
const isIndoor = (npc) => {
  const col = Math.floor(npc.worldPixel.x / sectorWidth);
  const row = Math.floor(npc.worldPixel.y / sectorHeight);
  const index = row * sectors.cols + col;
  return sectors.indoor[index] === 1 && sectors.bounded[index] === 1;
};

const indoorNpcs = world.npcs.filter(isIndoor);
const indoorLsw = indoorNpcs.filter((npc) => isLsw(imageFor(npc))).length;
const allLsw = world.npcs.filter((npc) => isLsw(imageFor(npc))).length;
const hostileRooms = report.rooms.filter((room) => room.faction === "hostile-milady");
const hostileAssignments = report.assignments.filter((assignment) => assignment.faction === "hostile-milady");
const hostileMiladyAssignments = hostileAssignments.filter((assignment) => isMilady(assignment.image)).length;
const hostileEligible = hostileRooms.reduce((sum, room) => sum + room.eligibleNpcs, 0);
const hostileNpcIds = new Set(hostileAssignments.map((assignment) => assignment.npcId));
const friendlyInteriorNpcs = indoorNpcs.filter((npc) => !hostileNpcIds.has(npc.npcId));
const friendlyInteriorLsw = friendlyInteriorNpcs.filter((npc) => isLsw(imageFor(npc))).length;
const friendlyRooms = report.rooms.filter((room) => room.faction === "friendly-lsw");
const friendlyAssignments = report.assignments.filter((assignment) => assignment.faction === "friendly-lsw");
const friendlyRoomLswAssignments = friendlyAssignments.filter(
  (assignment) => assignment.roomId && isLsw(assignment.image)
).length;
const friendlyRoomEligible = friendlyRooms.reduce((sum, room) => sum + room.eligibleNpcs, 0);

const metrics = {
  interiorNpcCount: indoorNpcs.length,
  interiorLswCount: indoorLsw,
  interiorLswPercent: percent(indoorLsw, indoorNpcs.length),
  friendlyInteriorNpcCount: friendlyInteriorNpcs.length,
  friendlyInteriorLswCount: friendlyInteriorLsw,
  friendlyInteriorLswPercent: percent(friendlyInteriorLsw, friendlyInteriorNpcs.length),
  allLswCount: allLsw,
  lswIndoorSharePercent: percent(indoorLsw, allLsw),
  hostileRoomEligibleNpcs: hostileEligible,
  hostileRoomMiladyAssignments: hostileMiladyAssignments,
  hostileRoomMiladyPercent: percent(hostileMiladyAssignments, hostileEligible),
  friendlyRoomEligibleNpcs: friendlyRoomEligible,
  friendlyRoomLswAssignments,
  friendlyRoomLswPercent: percent(friendlyRoomLswAssignments, friendlyRoomEligible),
  compiledAssignments: report.counts.assigned
};

const failures = [];
if (metrics.friendlyInteriorLswPercent < casting.acceptance.minimumInteriorLswPercent) {
  failures.push(`friendly-interior LSW coverage ${metrics.friendlyInteriorLswPercent}% is below ${casting.acceptance.minimumInteriorLswPercent}%`);
}
if (metrics.lswIndoorSharePercent < casting.acceptance.minimumLswIndoorSharePercent) {
  failures.push(`LSW indoor share ${metrics.lswIndoorSharePercent}% is below ${casting.acceptance.minimumLswIndoorSharePercent}%`);
}
if (metrics.hostileRoomMiladyPercent < casting.acceptance.minimumHostileRoomMiladyPercent) {
  failures.push(`hostile-room Milady coverage ${metrics.hostileRoomMiladyPercent}% is below ${casting.acceptance.minimumHostileRoomMiladyPercent}%`);
}
if (hostileAssignments.some((assignment) => !isMilady(assignment.image))) {
  failures.push("a hostile-room assignment does not use a Milady-family image");
}
if (friendlyAssignments.some((assignment) => assignment.roomId && !isLsw(assignment.image))) {
  failures.push("a friendly-room assignment does not use a Little Swag World image");
}
for (const roomConfig of casting.rooms) {
  const roomReport = report.rooms.find((room) => room.id === roomConfig.id);
  const roomAssignments = report.assignments.filter((assignment) => assignment.roomId === roomConfig.id);
  const requiredCoverage = roomConfig.coveragePercent ?? casting.policy.defaultCoveragePercent;
  const actualCoverage = percent(roomReport?.assignedNpcs ?? 0, roomReport?.eligibleNpcs ?? 0);
  if (actualCoverage < requiredCoverage) {
    failures.push(`${roomConfig.id} assignment coverage ${actualCoverage}% is below ${requiredCoverage}%`);
  }
  if (roomConfig.fixedImage && roomAssignments.some((assignment) => assignment.image !== roomConfig.fixedImage)) {
    failures.push(`${roomConfig.id} does not use its fixed room image for every assignment`);
  }
}

console.log(JSON.stringify({
  status: failures.length === 0 ? "PASS" : "FAIL",
  metrics,
  thresholds: casting.acceptance,
  rooms: report.rooms,
  failures
}, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

function percent(numerator, denominator) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}
