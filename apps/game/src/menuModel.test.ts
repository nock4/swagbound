import { describe, expect, it } from "vitest";
import { buildAtmScreen } from "./menuModel";

describe("buildAtmScreen", () => {
  it("offers withdrawals from banked battle winnings even when wallet is empty", () => {
    const screen = buildAtmScreen({
      partyState: {
        wallet: 0,
        bank: 120,
        party: () => []
      }
    });

    expect(screen.items).toContainEqual(expect.objectContaining({
      id: "atm-withdraw-50",
      enabled: true
    }));
    expect(screen.items).toContainEqual(expect.objectContaining({
      id: "atm-deposit-empty",
      enabled: false
    }));
  });
});
