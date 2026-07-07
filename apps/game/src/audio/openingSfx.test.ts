import { afterEach, describe, expect, it, vi } from "vitest";

class FakeAudioParam {
  value = 0;
  events: Array<{ kind: string; value: number; time: number }> = [];

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ kind: "set", value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ kind: "linear", value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ kind: "exponential", value, time });
  }
}

class FakeGain {
  gain = new FakeAudioParam();
  connections: unknown[] = [];

  connect(target: unknown): void {
    this.connections.push(target);
  }
}

class FakeOscillator {
  type: OscillatorType = "sine";
  frequency = new FakeAudioParam();
  starts: number[] = [];
  stops: number[] = [];

  connect(): void {}

  start(time: number): void {
    this.starts.push(time);
  }

  stop(time: number): void {
    this.stops.push(time);
  }
}

class FakeBufferSource {
  buffer?: unknown;
  starts: number[] = [];
  stops: number[] = [];

  connect(): void {}

  start(time: number): void {
    this.starts.push(time);
  }

  stop(time: number): void {
    this.stops.push(time);
  }
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
  gains: FakeGain[] = [];
  filters: FakeBiquadFilter[] = [];
  buffers: Array<{ channels: number; length: number; sampleRate: number }> = [];
  resumeCalls = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
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
    const filter = new FakeBiquadFilter();
    this.filters.push(filter);
    return filter as unknown as BiquadFilterNode;
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    this.buffers.push({ channels, length, sampleRate });
    return new FakeAudioBuffer(length) as unknown as AudioBuffer;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
  }
}

describe("OpeningSfx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    FakeAudioContext.instances = [];
    FakeAudioContext.nextState = "running";
  });

  it("schedules a low 1.2s rumble with oscillator and low-passed brown noise", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.resetModules();
    const { createOpeningSfx } = await import("./openingSfx");

    const sfx = createOpeningSfx();
    sfx.rumble();

    const context = FakeAudioContext.instances[0];
    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0].type).toBe("sine");
    expect(context.oscillators[0].frequency.events).toEqual([
      { kind: "set", value: 42, time: 10 },
      { kind: "exponential", value: 36, time: 11.2 }
    ]);
    expect(context.bufferSources).toHaveLength(1);
    expect(context.buffers[0]).toEqual({ channels: 1, length: 1200, sampleRate: 1000 });
    expect(context.filters[0].type).toBe("lowpass");
    expect(context.filters[0].frequency.events[0]).toEqual({ kind: "set", value: 115, time: 10 });
  });

  it("schedules knock-knock then knock-knock before the bedroom line", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.resetModules();
    const { createOpeningSfx } = await import("./openingSfx");

    const sfx = createOpeningSfx();
    sfx.bedroomKnock();

    const context = FakeAudioContext.instances[0];
    const tapStarts = context.bufferSources.map((source) => source.starts[0]);
    expect(tapStarts).toEqual([10, 10.14, 10.54, 10.68]);
    const tapStops = context.bufferSources.map((source) => source.stops[0]);
    expect(tapStops[0]).toBeCloseTo(10.09);
    expect(tapStops[1]).toBeCloseTo(10.23);
    expect(tapStops[2]).toBeCloseTo(10.63);
    expect(tapStops[3]).toBeCloseTo(10.77);
    expect(context.oscillators).toHaveLength(4);
  });

  it("tries to resume a suspended context without throwing", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    FakeAudioContext.nextState = "suspended";
    vi.resetModules();
    const { createOpeningSfx } = await import("./openingSfx");

    const sfx = createOpeningSfx();
    sfx.rumble();

    const context = FakeAudioContext.instances[0];
    expect(context.resumeCalls).toBe(1);
    expect(context.oscillators).toHaveLength(1);
  });
});
