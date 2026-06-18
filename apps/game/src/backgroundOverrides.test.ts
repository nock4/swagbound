import { describe, expect, it } from "vitest";
import type { BackgroundOverrideEntry, BackgroundOverrides } from "@eb/schemas";
import {
  backgroundOverrideAssetUrl,
  backgroundOverrideImageKey,
  resolveBackgroundOverrideEntry,
  toBattleBackground
} from "./backgroundOverrides";

const DEFAULT_ENTRY: BackgroundOverrideEntry = {
  image: "assets/swagbound/battle-backgrounds/projections-001.png",
  distortion: {
    amplitude: 8,
    frequency: 2.75,
    speed: 0.85
  }
};

const MAPPED_ENTRY: BackgroundOverrideEntry = {
  image: "assets/swagbound/battle-backgrounds/caves-001.png",
  distortion: {
    amplitude: 6,
    frequency: 1.75,
    speed: 0.6
  },
  distortionType: "vertical-compression",
  scroll: {
    x: 1,
    y: 0
  }
};

const OVERRIDES: BackgroundOverrides = {
  schema: "swagbound.background-overrides.v1",
  default: "projections-001",
  entries: {
    "projections-001": DEFAULT_ENTRY,
    "caves-001": MAPPED_ENTRY
  },
  byBackgroundId: {
    "3": "caves-001"
  }
};

describe("background override helpers", () => {
  it("resolves byBackgroundId before the default entry", () => {
    expect(resolveBackgroundOverrideEntry(OVERRIDES, 3)).toEqual({
      entryId: "caves-001",
      entry: MAPPED_ENTRY
    });
  });

  it("falls back to the default entry when the EB background id is unmapped", () => {
    expect(resolveBackgroundOverrideEntry(OVERRIDES, 99)).toEqual({
      entryId: "projections-001",
      entry: DEFAULT_ENTRY
    });
  });

  it("returns undefined when overrides or resolved entries are missing", () => {
    expect(resolveBackgroundOverrideEntry(undefined, 3)).toBeUndefined();
    expect(resolveBackgroundOverrideEntry({
      schema: "swagbound.background-overrides.v1",
      default: "missing-entry",
      entries: {}
    }, 3)).toBeUndefined();
  });

  it("builds stable image keys that differ when the image path changes", () => {
    const first = backgroundOverrideImageKey("projections-001", DEFAULT_ENTRY.image);
    expect(backgroundOverrideImageKey("projections-001", DEFAULT_ENTRY.image)).toBe(first);
    expect(backgroundOverrideImageKey("projections-001", "assets/swagbound/battle-backgrounds/projections-002.png")).not.toBe(first);
  });

  it("normalizes image URLs to a leading slash", () => {
    expect(backgroundOverrideAssetUrl("assets/swagbound/battle-backgrounds/projections-001.png")).toBe(
      "/assets/swagbound/battle-backgrounds/projections-001.png"
    );
    expect(backgroundOverrideAssetUrl("/assets/swagbound/battle-backgrounds/projections-001.png")).toBe(
      "/assets/swagbound/battle-backgrounds/projections-001.png"
    );
  });

  it("converts an override entry into an animated battle background shape", () => {
    expect(toBattleBackground(MAPPED_ENTRY)).toEqual({
      id: 0,
      distortion: {
        ...MAPPED_ENTRY.distortion,
        kind: "vertical-compression"
      },
      scroll: MAPPED_ENTRY.scroll
    });
  });

  it("keeps an authored distortion kind when no override distortion type is present", () => {
    const entry: BackgroundOverrideEntry = {
      image: "assets/swagbound/battle-backgrounds/projections-001.png",
      distortion: {
        kind: "horizontal, smooth",
        amplitude: 8,
        frequency: 2.75,
        speed: 0.85
      }
    };

    expect(toBattleBackground(entry).distortion?.kind).toBe("horizontal, smooth");
  });
});
