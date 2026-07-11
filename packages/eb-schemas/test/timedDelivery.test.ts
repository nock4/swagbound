import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TimedDeliveriesSchema } from "../src/index";

describe("TimedDeliveriesSchema", () => {
  it("parses the authored timed delivery overlay", () => {
    const parsed = TimedDeliveriesSchema.parse(JSON.parse(readFileSync(
      new URL("../../../content/timed-delivery.json", import.meta.url),
      "utf8"
    )));

    expect(parsed.deliveries).toHaveLength(10);
    expect(parsed.deliveries.find((entry) => entry.id === "ward-pie")).toMatchObject({
      eventFlag: 180,
      itemId: 95,
      timeUntilDelivery: 180
    });
  });

  it("rejects duplicate event flags", () => {
    const parsed = TimedDeliveriesSchema.safeParse({
      schema: "swagbound.timed-delivery.v1",
      deliveries: [
        delivery("first", 180),
        delivery("second", 180)
      ]
    });

    expect(parsed.success).toBe(false);
  });
});

function delivery(id: string, eventFlag: number) {
  return {
    id,
    spriteId: 151,
    eventFlag,
    eventFlagName: "FLG_DELIVERY_PIZZA",
    timeUntilDelivery: 10,
    serviceName: "Swag Express",
    sendMessage: "Swag Express took the order.",
    arrivalMessage: "Swag Express arrives."
  };
}
