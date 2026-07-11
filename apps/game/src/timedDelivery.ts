import type { TimedDeliveries, TimedDeliveryEntry } from "@eb/schemas";

export type TimedDeliveryTimer = {
  remainingFrames: number;
  arrived: boolean;
};

export type TimedDeliveryRuntimeState = {
  timers: Record<string, TimedDeliveryTimer>;
};

export type TimedDeliveryFlags = {
  isSet(flag: number): boolean;
};

export function createTimedDeliveryRuntimeState(): TimedDeliveryRuntimeState {
  return { timers: {} };
}

export function advanceTimedDeliveries(
  state: TimedDeliveryRuntimeState,
  deliveries: TimedDeliveries | undefined,
  flags: TimedDeliveryFlags,
  elapsedFrames: number
): TimedDeliveryEntry[] {
  const arrived: TimedDeliveryEntry[] = [];
  const knownIds = new Set((deliveries?.deliveries ?? []).map((delivery) => delivery.id));
  for (const id of Object.keys(state.timers)) {
    if (!knownIds.has(id)) {
      delete state.timers[id];
    }
  }

  for (const delivery of deliveries?.deliveries ?? []) {
    if (!flags.isSet(delivery.eventFlag)) {
      delete state.timers[delivery.id];
      continue;
    }

    const existing = state.timers[delivery.id];
    if (!existing) {
      state.timers[delivery.id] = {
        remainingFrames: Math.max(0, delivery.timeUntilDelivery),
        arrived: delivery.timeUntilDelivery <= 0
      };
      if (delivery.timeUntilDelivery <= 0) {
        arrived.push(delivery);
      }
      continue;
    }

    if (existing.arrived) {
      continue;
    }

    existing.remainingFrames = Math.max(0, existing.remainingFrames - Math.max(0, elapsedFrames));
    if (existing.remainingFrames <= 0) {
      existing.arrived = true;
      arrived.push(delivery);
    }
  }

  return arrived;
}

export function completeTimedDelivery(state: TimedDeliveryRuntimeState, deliveryId: string): void {
  delete state.timers[deliveryId];
}
