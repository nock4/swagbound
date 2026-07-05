import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicManifestSchema, type MusicManifest } from "@eb/schemas";
import {
  createMusic,
  DEFAULT_MUSIC_CUE_GAIN,
  NoopMusic,
  publicMusicUrl,
  resolveMusicCue,
  WebAudioMusic,
  type AudioContextConstructor
} from "../src/audio/music";

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudioContext.instances = [];
});

describe("music manifest resolution", () => {
  it("defaults loop and gain while preserving cue lookup", () => {
    const parsed = MusicManifestSchema.parse({
      schema: "swagbound.music-manifest.v1",
      cues: {
        overworld: { file: "audio/music/overworld.mp3" },
        battle: { file: "audio/music/battle.mp3", loop: false, gain: 0.25 }
      }
    });

    expect(parsed.cues.overworld).toMatchObject({
      file: "audio/music/overworld.mp3",
      loop: true,
      gain: DEFAULT_MUSIC_CUE_GAIN
    });
    expect(resolveMusicCue(parsed, "battle")).toEqual({
      cue: "battle",
      file: "audio/music/battle.mp3",
      loop: false,
      gain: 0.25
    });
    expect(resolveMusicCue(parsed, "missing")).toBeUndefined();
    expect(publicMusicUrl("audio/music/overworld.mp3")).toBe("/audio/music/overworld.mp3");
  });

  it("resolves interior and victory cues from the manifest", () => {
    const parsed = MusicManifestSchema.parse({
      schema: "swagbound.music-manifest.v1",
      cues: {
        interior: { file: "audio/music/interior.mp3", loop: true, gain: 0.4 },
        victory: { file: "audio/music/victory.mp3", loop: false, gain: 0.45 }
      }
    });

    expect(resolveMusicCue(parsed, "interior")).toEqual({
      cue: "interior",
      file: "audio/music/interior.mp3",
      loop: true,
      gain: 0.4
    });
    expect(resolveMusicCue(parsed, "victory")).toEqual({
      cue: "victory",
      file: "audio/music/victory.mp3",
      loop: false,
      gain: 0.45
    });
  });

  it("resolves a per-group boss cue, falling back to the generic boss track", () => {
    const parsed = MusicManifestSchema.parse({
      schema: "swagbound.music-manifest.v1",
      cues: {
        boss: { file: "audio/music/boss.mp3", loop: true, gain: 0.42 }
      },
      bossCues: {
        "449": { file: "audio/music/venue.mp3", loop: true, gain: 0.5 }
      }
    });

    // Group with a dedicated track uses it.
    expect(resolveMusicCue(parsed, "boss:449")).toEqual({
      cue: "boss:449",
      file: "audio/music/venue.mp3",
      loop: true,
      gain: 0.5
    });
    // Group without one falls back to the generic boss cue (still plays).
    expect(resolveMusicCue(parsed, "boss:172")).toEqual({
      cue: "boss:172",
      file: "audio/music/boss.mp3",
      loop: true,
      gain: 0.42
    });
    // The plain boss cue still resolves.
    expect(resolveMusicCue(parsed, "boss")).toMatchObject({ file: "audio/music/boss.mp3" });
  });
});

describe("NoopMusic", () => {
  it("is safe when Web Audio is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);

    const music = createMusic(manifest());

    expect(music).toBeInstanceOf(NoopMusic);
    await expect(music.play("overworld")).resolves.toBeUndefined();
    expect(() => music.stop()).not.toThrow();
    expect(() => music.resume()).not.toThrow();
    expect(() => music.setEnabled(false)).not.toThrow();
  });
});

describe("WebAudioMusic", () => {
  it("stays silent when a cue file is missing", async () => {
    const fetchMusic = vi.fn(async () => ({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0)
    } as Response));
    const logger = { warn: vi.fn() };
    const music = new WebAudioMusic(manifest(), {
      audioContextConstructor: FakeAudioContext as unknown as AudioContextConstructor,
      fetch: fetchMusic,
      logger,
      fadeMs: 0
    });

    await expect(music.play("overworld")).resolves.toBeUndefined();
    await expect(music.play("overworld")).resolves.toBeUndefined();

    const context = FakeAudioContext.instances[0];
    expect(context.sources).toHaveLength(0);
    expect(fetchMusic).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("does not restart the same cue once playing", async () => {
    const fetchMusic = vi.fn(async () => audioResponse());
    const music = new WebAudioMusic(manifest({
      overworld: { file: "audio/music/overworld.mp3", loop: false, gain: 0.25 }
    }), {
      audioContextConstructor: FakeAudioContext as unknown as AudioContextConstructor,
      fetch: fetchMusic,
      logger: { warn: vi.fn() },
      fadeMs: 0
    });

    await music.play("overworld");
    await music.play("overworld");

    const context = FakeAudioContext.instances[0];
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].loop).toBe(false);
    expect(context.sources[0].start).toHaveBeenCalledTimes(1);
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, context.currentTime);
    expect(fetchMusic).toHaveBeenCalledTimes(1);
  });

  it("does not fetch unknown cues", async () => {
    const fetchMusic = vi.fn(async () => audioResponse());
    const music = new WebAudioMusic(manifest(), {
      audioContextConstructor: FakeAudioContext as unknown as AudioContextConstructor,
      fetch: fetchMusic,
      logger: { warn: vi.fn() }
    });

    await music.play("missing");

    expect(fetchMusic).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });
});

function manifest(cues: Record<string, unknown> = {
  overworld: { file: "audio/music/overworld.mp3", loop: true, gain: 0.6 }
}): MusicManifest {
  return MusicManifestSchema.parse({
    schema: "swagbound.music-manifest.v1",
    cues
  });
}

function audioResponse(): Response {
  return {
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8)
  } as Response;
}

class FakeAudioParam {
  value = 1;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
  linearRampToValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSourceNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = "running";
  currentTime = 3;
  destination = {} as AudioDestinationNode;
  sources: FakeSourceNode[] = [];
  gains: FakeGainNode[] = [];
  decoded = {} as AudioBuffer;
  decodeAudioData = vi.fn(async () => this.decoded);
  resume = vi.fn(async () => {
    this.state = "running";
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain(): GainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}
