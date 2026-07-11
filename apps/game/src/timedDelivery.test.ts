import { describe, expect, it } from "vitest";
import type { TimedDeliveries } from "@eb/schemas";
import { advanceTimedDeliveries, completeTimedDelivery, createTimedDeliveryRuntimeState } from "./timedDelivery";

describe("timed delivery runtime", () => {
  it("starts a timer when an order flag is set and reports arrival once", () => {
    const state = createTimedDeliveryRuntimeState();
    const flags = new Set<number>();
    const deliveries: TimedDeliveries = {
      schema: "swagbound.timed-delivery.v1",
      deliveries: [{
        id: "ward-pie",
        spriteId: 151,
        eventFlag: 180,
        eventFlagName: "FLG_DELIVERY_PIZZA",
        timeUntilDelivery: 3,
        serviceName: "Swag Express",
        sendMessage: "Swag Express took the order.",
        arrivalMessage: "Swag Express arrives.",
        itemId: 95
      }]
    };

    expect(advanceTimedDeliveries(state, deliveries, { isSet: (flag) => flags.has(flag) }, 10)).toEqual([]);
    flags.add(180);
    expect(advanceTimedDeliveries(state, deliveries, { isSet: (flag) => flags.has(flag) }, 1)).toEqual([]);
    expect(state.timers["ward-pie"]).toMatchObject({ remainingFrames: 3, arrived: false });

    expect(advanceTimedDeliveries(state, deliveries, { isSet: (flag) => flags.has(flag) }, 2)).toEqual([]);
    const arrived = advanceTimedDeliveries(state, deliveries, { isSet: (flag) => flags.has(flag) }, 1);
    expect(arrived.map((entry) => entry.id)).toEqual(["ward-pie"]);
    expect(advanceTimedDeliveries(state, deliveries, { isSet: (flag) => flags.has(flag) }, 1)).toEqual([]);

    flags.delete(180);
    completeTimedDelivery(state, "ward-pie");
    expect(state.timers).toEqual({});
  });
});
