import { audioContextAvailable, sharedAudioContext } from "./sharedAudioContext";

export interface OpeningSfx {
  resume(): void;
  rumble(): void;
  bedroomKnock(): void;
}

export type OpeningSfxOptions = {
  muted?: boolean;
  volume?: number;
};

export const OPENING_SFX_MASTER_GAIN = 0.42;

const MIN_GAIN = 0.0001;
const RUMBLE_DURATION_SEC = 1.2;
const KNOCK_TAP_DURATION_SEC = 0.08;
const KNOCK_TAP_OFFSETS_SEC = [0, 0.14, 0.54, 0.68] as const;

export class NoopOpeningSfx implements OpeningSfx {
  resume(): void {}
  rumble(): void {}
  bedroomKnock(): void {}
}

export class WebAudioOpeningSfx implements OpeningSfx {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private unavailable = false;

  constructor(private readonly options: OpeningSfxOptions = {}) {}

  resume(): void {
    const context = this.audioContext();
    if (!context || context.state !== "suspended") {
      return;
    }
    void context.resume().catch(() => {
      this.unavailable = true;
    });
  }

  rumble(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.lowTone(context, {
        start,
        duration: RUMBLE_DURATION_SEC,
        fromHz: 42,
        toHz: 36,
        gain: 0.055,
        attack: 0.24
      });
      this.brownNoiseBurst(context, {
        start,
        duration: RUMBLE_DURATION_SEC,
        frequencyHz: 115,
        gain: 0.018,
        attack: 0.2
      });
    });
  }

  bedroomKnock(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      for (const offset of KNOCK_TAP_OFFSETS_SEC) {
        this.knockTap(context, start + offset);
      }
    });
  }

  private withContext(callback: (context: AudioContext) => void): void {
    if (this.options.muted) {
      return;
    }
    const context = this.audioContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
    try {
      callback(context);
    } catch {
      this.unavailable = true;
    }
  }

  private audioContext(): AudioContext | undefined {
    if (this.unavailable || this.options.muted) {
      return undefined;
    }
    if (this.context?.state === "closed") {
      this.context = undefined;
      this.masterGain = undefined;
    }
    if (this.context) {
      return this.context;
    }
    const context = sharedAudioContext();
    if (!context) {
      this.unavailable = true;
      return undefined;
    }
    try {
      this.context = context;
      this.masterGain = context.createGain();
      this.masterGain.gain.value = clamp(this.options.volume ?? OPENING_SFX_MASTER_GAIN, 0, 1);
      this.masterGain.connect(context.destination);
      return this.context;
    } catch {
      this.unavailable = true;
      return undefined;
    }
  }

  private lowTone(
    context: AudioContext,
    options: {
      start: number;
      duration: number;
      fromHz: number;
      toHz: number;
      gain: number;
      attack: number;
    }
  ): void {
    const output = this.masterGain;
    if (!output) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(Math.max(1, options.fromHz), options.start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.toHz), options.start + options.duration);
    gain.gain.setValueAtTime(MIN_GAIN, options.start);
    gain.gain.linearRampToValueAtTime(options.gain, options.start + Math.min(options.attack, options.duration / 2));
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, options.start + options.duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(options.start);
    oscillator.stop(options.start + options.duration + 0.02);
  }

  private knockTap(context: AudioContext, start: number): void {
    this.brownNoiseBurst(context, {
      start,
      duration: KNOCK_TAP_DURATION_SEC,
      frequencyHz: 185,
      gain: 0.16,
      attack: 0.008
    });
    this.lowTone(context, {
      start,
      duration: KNOCK_TAP_DURATION_SEC,
      fromHz: 92,
      toHz: 68,
      gain: 0.075,
      attack: 0.006
    });
  }

  private brownNoiseBurst(
    context: AudioContext,
    options: {
      start: number;
      duration: number;
      frequencyHz: number;
      gain: number;
      attack: number;
    }
  ): void {
    const output = this.masterGain;
    if (!output) {
      return;
    }
    const buffer = context.createBuffer(1, Math.max(1, Math.ceil(context.sampleRate * options.duration)), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < samples.length; index += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      samples[index] = last * 3.5;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(Math.max(1, options.frequencyHz), options.start);
    gain.gain.setValueAtTime(MIN_GAIN, options.start);
    gain.gain.linearRampToValueAtTime(options.gain, options.start + Math.min(options.attack, options.duration / 2));
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, options.start + options.duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(options.start);
    source.stop(options.start + options.duration + 0.01);
  }
}

export function createOpeningSfx(options: OpeningSfxOptions = {}): OpeningSfx {
  return audioContextAvailable() ? new WebAudioOpeningSfx(options) : new NoopOpeningSfx();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
