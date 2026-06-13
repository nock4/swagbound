import { describe, expect, it } from "vitest";
import { shouldRunNewGameStartup } from "../src/state";

describe("new-game startup gating", () => {
  it("runs the startup event only for a fresh slot with a resolved reference", () => {
    expect(shouldRunNewGameStartup({
      hasSave: false,
      startupRef: "data_00.l_0xc01234"
    })).toEqual({
      run: true,
      reference: "data_00.l_0xc01234"
    });
  });

  it("skips the startup event when a save exists", () => {
    expect(shouldRunNewGameStartup({
      hasSave: true,
      startupRef: "data_00.l_0xc01234"
    })).toEqual({
      run: false,
      skippedReason: "save_present"
    });
  });

  it("skips the startup event when the generated reference is absent", () => {
    expect(shouldRunNewGameStartup({
      hasSave: false
    })).toEqual({
      run: false,
      skippedReason: "missing_ref"
    });
  });
});
