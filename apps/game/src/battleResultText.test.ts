import { describe, expect, it } from "vitest";
import { namedEnemyResultLine, namedEnemyResultPages } from "./battleResultText";

describe("named enemy battle results", () => {
  it("uses contextual Swagbound result verbs", () => {
    expect(namedEnemyResultLine("MiFella Congregant")).toBe("MiFella Congregant logged off.");
    expect(namedEnemyResultLine("Bosch Derivative")).toBe("Bosch Derivative was delisted.");
    expect(namedEnemyResultLine("Floor Underwriter")).toBe("Floor Underwriter was liquidated.");
    expect(namedEnemyResultLine("Blood Banker")).toBe("Blood Banker got drained.");
    expect(namedEnemyResultLine("Correction Engine")).toBe("Correction Engine went offline.");
    expect(namedEnemyResultLine("Milady Manifestation")).toBe("Milady Manifestation lost its shape.");
  });

  it("always includes the displayed enemy name and wraps long results", () => {
    const pages = namedEnemyResultPages(["Unstable Bosch Derivative"]);
    expect(pages.flat().join(" ")).toContain("Unstable Bosch Derivative");
    expect(pages.flat().every((line) => line.length <= 28)).toBe(true);
  });

  it("does not repeat identical enemy names in group battles", () => {
    expect(namedEnemyResultPages(["Card Kid", "Card Kid"]).flat()).toEqual(["Card Kid logged off."]);
  });
});
