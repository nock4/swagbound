import { afterEach, describe, expect, it, vi } from "vitest";

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number): void {
    this.value = value;
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
}

class FakeGain {
  gain = new FakeAudioParam();

  connect(): void {}
}

class FakeOscillator {
  type: OscillatorType = "sine";
  frequency = new FakeAudioParam();

  connect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeBufferSource {
  buffer?: unknown;

  connect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeBiquadFilter {
  type: BiquadFilterType = "lowpass";
  Q = { value: 0 };
  frequency = new FakeAudioParam();

  connect(): void {}
}

class FakeAudioBuffer {
  private readonly samples: Float32Array;

  constructor(length: number) {
    this.samples = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.samples;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static nextState: AudioContextState = "running";

  currentTime = 10;
  sampleRate = 1000;
  state: AudioContextState = FakeAudioContext.nextState;
  destination = {};
  oscillators: FakeOscillator[] = [];
  bufferSources: FakeBufferSource[] = [];
  resumeCalls = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain(): GainNode {
    return new FakeGain() as unknown as GainNode;
  }

  createOscillator(): OscillatorNode {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeBiquadFilter() as unknown as BiquadFilterNode;
  }

  createBuffer(_channels: number, length: number, _sampleRate: number): AudioBuffer {
    return new FakeAudioBuffer(length) as unknown as AudioBuffer;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
  }
}

function callEveryCue(sfx: {
  resume(): void;
  catchSuccess(): void;
  negotiationRight(step: number): void;
  negotiationWrong(): void;
  fusionPoof(): void;
  petChirp(): void;
  altarHum(): void;
}): void {
  sfx.resume();
  sfx.catchSuccess();
  sfx.negotiationRight(3);
  sfx.negotiationWrong();
  sfx.fusionPoof();
  sfx.petChirp();
  sfx.altarHum();
}

describe("MonsSfx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    FakeAudioContext.instances = [];
    FakeAudioContext.nextState = "running";
  });

  it("creates a working headless fallback when AudioContext is absent", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    vi.resetModules();
    const { createMonsSfx, NoopMonsSfx } = await import("./monsSfx");

    const sfx = createMonsSfx();

    expect(sfx).toBeInstanceOf(NoopMonsSfx);
    expect(() => callEveryCue(sfx)).not.toThrow();
  });

  it("keeps every NoopMonsSfx method safe", async () => {
    const { NoopMonsSfx } = await import("./monsSfx");
    const sfx = new NoopMonsSfx();

    expect(() => callEveryCue(sfx)).not.toThrow();
  });

  it("creates the Web Audio implementation and schedules every cue headlessly", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    FakeAudioContext.nextState = "suspended";
    vi.resetModules();
    const { createMonsSfx, WebAudioMonsSfx } = await import("./monsSfx");

    const sfx = createMonsSfx();

    expect(sfx).toBeInstanceOf(WebAudioMonsSfx);
    expect(() => callEveryCue(sfx)).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].resumeCalls).toBe(1);
    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(15);
    expect(FakeAudioContext.instances[0].bufferSources).toHaveLength(1);
  });
});
