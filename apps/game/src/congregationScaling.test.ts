import { describe, expect, it } from "vitest";
import type { BattleEnemy } from "@eb/schemas";
import { applyCongregationScaling, CONGREGATION_TRIGGER_ID, unchallengedTestimonialCount } from "./congregationScaling";

const crowd = (offense: number): BattleEnemy[] => [{
  id: 19,
  name: "Conducting Spirit",
  spriteId: 103,
  overworldSprite: 0,
  level: 30,
  hp: 587,
  defense: 139,
  offense,
  speed: 20,
  experience: 5000,
  money: 400,
  bossFlag: true,
  actions: [],
  itemDropped: 0,
  itemRarity: 0
} as unknown as BattleEnemy];

const ALL_THREE = [
  "fuel:onboarding:testimonial-one",
  "fuel:onboarding:testimonial-two",
  "fuel:onboarding:testimonial-three"
];

describe("congregation scaling", () => {
  it("counts unchallenged testimonials", () => {
    expect(unchallengedTestimonialCount([])).toBe(3);
    expect(unchallengedTestimonialCount(ALL_THREE.slice(0, 1))).toBe(2);
    expect(unchallengedTestimonialCount(ALL_THREE)).toBe(0);
  });

  it("scales offense by +30% per unchallenged testimonial", () => {
    const scaled = applyCongregationScaling(crowd(130), CONGREGATION_TRIGGER_ID, []);
    expect(scaled[0].offense).toBe(247); // 130 * 1.9
    const one = applyCongregationScaling(crowd(130), CONGREGATION_TRIGGER_ID, ALL_THREE.slice(0, 2));
    expect(one[0].offense).toBe(169); // 130 * 1.3
  });

  it("leaves the crowd at base volume when all three were challenged", () => {
    const scaled = applyCongregationScaling(crowd(130), CONGREGATION_TRIGGER_ID, ALL_THREE);
    expect(scaled[0].offense).toBe(130);
  });

  it("does not touch other story gates sharing the group (source-pier)", () => {
    const scaled = applyCongregationScaling(crowd(130), "source-pier", []);
    expect(scaled[0].offense).toBe(130);
    expect(applyCongregationScaling(crowd(130), undefined, [])[0].offense).toBe(130);
  });

  it("does not mutate the input enemies", () => {
    const input = crowd(130);
    applyCongregationScaling(input, CONGREGATION_TRIGGER_ID, []);
    expect(input[0].offense).toBe(130);
  });
});
