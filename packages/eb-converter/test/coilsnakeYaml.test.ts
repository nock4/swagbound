import { describe, expect, it } from "vitest";
import { parseIntKeyedYaml } from "../src/coilsnakeYaml";

describe("parseIntKeyedYaml", () => {
  it("reads simple two-space Key: value fields", () => {
    const entries = parseIntKeyedYaml(["0:", "  Action: 10", "  Strength: alpha"].join("\n"));
    expect(entries.get(0)).toEqual({ Action: "10", Strength: "alpha" });
  });

  it("folds YAML block-list values into their field (the PSI Type regression)", () => {
    // CoilSnake emits PSI category as a block list under `Type:`. A naive
    // single-line parse dropped it, blanking offense/recovery for every spell.
    const source = ["1:", "  Action: 10", "  Strength: alpha", "  Type:", "  - offense", "  Usability: unusable"].join("\n");
    const entry = parseIntKeyedYaml(source).get(1);
    expect(entry?.Type).toBe("offense");
    expect(entry?.Usability).toBe("unusable");
  });

  it("comma-joins multi-item block lists and keeps inline empty lists intact", () => {
    const multi = parseIntKeyedYaml(["2:", "  Type:", "  - offense", "  - recovery"].join("\n"));
    expect(multi.get(2)?.Type).toBe("offense,recovery");
    const inlineEmpty = parseIntKeyedYaml(["3:", "  Type: []"].join("\n"));
    expect(inlineEmpty.get(3)?.Type).toBe("[]");
  });
});
