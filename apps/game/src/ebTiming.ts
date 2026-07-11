import hpMeterSpeedsJson from "../../../content/rom-truth/hp-meter-speeds.json";
import movementSpeedsJson from "../../../content/rom-truth/movement-speeds.json";

type FixedPointSpeed = {
  raw: number;
  pxPerFrame: number;
};

type MovementSpeedsTruth = {
  source: string;
  cardinal: FixedPointSpeed[];
  diagonal: FixedPointSpeed[];
};

type HpMeterSpeedTruth = {
  source: string;
  speeds: Array<{
    fracRaw: number;
    digitsPerFrame: number;
  }>;
};

export type MovementSpeedPxPerSecond = {
  cardinalPxPerSecond: number;
  diagonalPxPerSecond: number;
};

export type HpMeterRollTier = {
  name: "small" | "medium" | "large";
  minDelta: number;
  maxDelta: number;
  digitsPerFrame: number;
  digitsPerSecond: number;
};

const movementSpeeds = movementSpeedsJson as MovementSpeedsTruth;
const hpMeterSpeeds = hpMeterSpeedsJson as HpMeterSpeedTruth;

export const EB_NTSC_FRAMES_PER_SECOND = 60;
export const EB_NORMAL_MOVEMENT_SPEED_ID = 4;

export const EB_ROM_TRUTH_SOURCES = {
  movementSpeeds: movementSpeeds.source,
  hpMeterSpeeds: hpMeterSpeeds.source
} as const;

export function perFrameToPerSecond(valuePerFrame: number): number {
  return valuePerFrame * EB_NTSC_FRAMES_PER_SECOND;
}

export function pxPerFrameToPxPerSecond(pxPerFrame: number): number {
  return perFrameToPerSecond(pxPerFrame);
}

export function movementSpeedById(speedId: number): MovementSpeedPxPerSecond {
  const cardinal = movementSpeeds.cardinal[speedId];
  const diagonal = movementSpeeds.diagonal[speedId];
  if (!cardinal || !diagonal) {
    throw new RangeError(`Unknown EB movement speed id ${speedId}`);
  }
  return {
    cardinalPxPerSecond: pxPerFrameToPxPerSecond(cardinal.pxPerFrame),
    diagonalPxPerSecond: pxPerFrameToPxPerSecond(diagonal.pxPerFrame)
  };
}

export const EB_NORMAL_WALK_SPEED = movementSpeedById(EB_NORMAL_MOVEMENT_SPEED_ID);

export function diagonalPxPerSecondForCardinal(cardinalPxPerSecond: number): number {
  if (!Number.isFinite(cardinalPxPerSecond) || cardinalPxPerSecond <= 0) {
    return 0;
  }
  return cardinalPxPerSecond * (EB_NORMAL_WALK_SPEED.diagonalPxPerSecond / EB_NORMAL_WALK_SPEED.cardinalPxPerSecond);
}

function exactHpMeterDigitsPerFrame(entry: HpMeterSpeedTruth["speeds"][number]): number {
  return 1 + entry.fracRaw / 65536;
}

const [largeDeltaSpeed, mediumDeltaSpeed, smallDeltaSpeed] = hpMeterSpeeds.speeds;

if (!largeDeltaSpeed || !mediumDeltaSpeed || !smallDeltaSpeed) {
  throw new Error("Expected three EB HP meter roll speeds");
}

export const EB_HP_METER_ROLL_TIERS: readonly [HpMeterRollTier, HpMeterRollTier, HpMeterRollTier] = [
  {
    name: "small",
    minDelta: 1,
    maxDelta: 9,
    digitsPerFrame: exactHpMeterDigitsPerFrame(smallDeltaSpeed),
    digitsPerSecond: perFrameToPerSecond(exactHpMeterDigitsPerFrame(smallDeltaSpeed))
  },
  {
    name: "medium",
    minDelta: 10,
    maxDelta: 99,
    digitsPerFrame: exactHpMeterDigitsPerFrame(mediumDeltaSpeed),
    digitsPerSecond: perFrameToPerSecond(exactHpMeterDigitsPerFrame(mediumDeltaSpeed))
  },
  {
    name: "large",
    minDelta: 100,
    maxDelta: Number.POSITIVE_INFINITY,
    digitsPerFrame: exactHpMeterDigitsPerFrame(largeDeltaSpeed),
    digitsPerSecond: perFrameToPerSecond(exactHpMeterDigitsPerFrame(largeDeltaSpeed))
  }
];

export function hpMeterRollTierForDelta(delta: number): HpMeterRollTier {
  const magnitude = Math.abs(Math.trunc(delta));
  if (magnitude >= EB_HP_METER_ROLL_TIERS[2].minDelta) {
    return EB_HP_METER_ROLL_TIERS[2];
  }
  if (magnitude >= EB_HP_METER_ROLL_TIERS[1].minDelta) {
    return EB_HP_METER_ROLL_TIERS[1];
  }
  return EB_HP_METER_ROLL_TIERS[0];
}

export function hpMeterDigitsPerSecondForDelta(delta: number): number {
  return hpMeterRollTierForDelta(delta).digitsPerSecond;
}
