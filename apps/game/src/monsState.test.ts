import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MonAbilitiesSchema, MonFusionSchema, MonsRegistrySchema } from "@eb/schemas";
import { MonsState } from "./monsState";

const registry = MonsRegistrySchema.parse(JSON.parse(readFileSync(resolve("content/mons/mons-registry.json"), "utf8")));
const abilities = MonAbilitiesSchema.parse(JSON.parse(readFileSync(resolve("content/mons/mon-abilities.json"), "utf8")));
const fusion = MonFusionSchema.parse(JSON.parse(readFileSync(resolve("content/mons/mon-fusion.json"), "utf8")));

const byRace = (race: string, tier?: number) =>
  registry.mons.find((m) => m.race === race && !m.secretRare && (tier === undefined || m.tier === tier))!;

function fresh(): MonsState {
  return new MonsState(registry, abilities, fusion);
}

describe("MonsState runtime edges", () => {
  it("release adjusts activeIndex safely (below, at, above)", () => {
    const s = fresh();
    s.catchMon(byRace("Angel").id);
    s.catchMon(byRace("Demon").id);
    s.catchMon(byRace("Mystic").id);
    s.setActive(2);
    // release an index BELOW active -> active shifts down with it
    expect(s.release(0)).toBe(true);
    expect(s.active()?.index).toBe(1);
    // release the ACTIVE mon -> no active
    expect(s.release(1)).toBe(true);
    expect(s.active()).toBeUndefined();
  });

  it("fusion consuming the active parent clears the companion (no dangling index)", () => {
    const s = fresh();
    s.catchMon(byRace("Angel", 2).id);
    s.catchMon(byRace("Demon", 2).id);
    s.setActive(0);
    expect(s.active()?.index).toBe(0);
    const fused = s.fuse(0, 1, []);
    expect(fused).toBeTruthy();
    // both parents gone, result is the only mon, and no stale active pointer
    expect(s.count()).toBe(1);
    expect(s.active()).toBeUndefined();
    expect(s.at(0)?.registryId).toBe(fused!.registryId);
  });

  it("a catch survives a subsequent party wipe (snapshot taken at catch time)", () => {
    const s = fresh();
    s.catchMon(byRace("Zombie").id, { caughtAtFlag: "act2" });
    const snap = s.snapshot();
    // simulate death/reload: a brand-new state restores from the snapshot
    const reloaded = fresh();
    reloaded.restore(snap);
    expect(reloaded.count()).toBe(1);
    expect(reloaded.list()[0].registryId).toBe(byRace("Zombie").id);
  });

  it("restore drops registry ids that no longer exist and clamps activeIndex", () => {
    const s = fresh();
    s.restore({ roster: [
      { registryId: byRace("Angel").id, level: 5, xp: 0, bond: 0, inherited: [] },
      { registryId: "ghost-mon-does-not-exist", level: 5, xp: 0, bond: 0, inherited: [] }
    ], activeIndex: 1 });
    expect(s.count()).toBe(1);
    expect(s.active()).toBeUndefined();
  });

  it("farmTick only levels resting mons, never the active companion", () => {
    const s = fresh();
    s.catchMon(byRace("Demon", 1).id);
    s.catchMon(byRace("Angel", 1).id);
    s.setActive(0);
    const activeXpBefore = s.at(0)!.xp;
    const restingXpBefore = s.at(1)!.xp;
    for (let i = 0; i < 5; i++) s.farmTick();
    expect(s.at(0)!.xp).toBe(activeXpBefore);
    expect(s.at(1)!.xp).toBeGreaterThan(restingXpBefore);
  });

  it("previewFusion refuses same-index and a secret parent", () => {
    const s = fresh();
    s.catchMon(byRace("Angel").id);
    s.catchMon(registry.mons.find((m) => m.secretRare)!.id);
    expect(s.previewFusion(0, 0)?.ok).toBe(false);
    expect(s.previewFusion(0, 1)?.ok).toBe(false);
  });
});
