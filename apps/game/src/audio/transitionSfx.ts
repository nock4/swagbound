export interface TransitionSfx {
  resume(): void;
  doorOpen(): void;
  doorClose(): void;
  footsteps(): void;
  escalatorHum(): void;
  whoosh(): void;
}

export type TransitionSfxOptions = {
  muted?: boolean;
  volume?: number;
};

type AudioContextConstructor = new () => AudioContext;

export class NoopTransitionSfx implements TransitionSfx {
  resume(): void {}
  doorOpen(): void {}
  doorClose(): void {}
  footsteps(): void {}
  escalatorHum(): void {}
  whoosh(): void {}
}

export class WebAudioTransitionSfx implements TransitionSfx {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private unavailable = false;

  constructor(private readonly options: TransitionSfxOptions = {}) {}

  resume(): void {
    const context = this.audioContext();
    if (!context || context.state !== "suspended") {
      return;
    }
    void context.resume().catch(() => {
      this.unavailable = true;
    });
  }

  doorOpen(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "triangle", start, duration: 0.2, fromHz: 190, toHz: 95, gain: 0.24 });
      this.tone(context, { type: "sine", start: start + 0.03, duration: 0.16, fromHz: 360, toHz: 230, gain: 0.08 });
      this.noiseBurst(context, { start: start + 0.015, duration: 0.09, frequencyHz: 950, gain: 0.08 });
    });
  }

  doorClose(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "sine", start, duration: 0.16, fromHz: 120, toHz: 58, gain: 0.2 });
      this.noiseBurst(context, { start, duration: 0.07, frequencyHz: 280, gain: 0.13 });
    });
  }

  footsteps(): void {
    this.withContext((context) => {
      const start = context.currentTime + 0.08;
      for (let index = 0; index < 4; index += 1) {
        this.noiseBurst(context, {
          start: start + index * 0.18,
          duration: 0.045,
          frequencyHz: index % 2 === 0 ? 620 : 480,
          gain: 0.08
        });
      }
    });
  }

  escalatorHum(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "sine", start, duration: 1.18, fromHz: 86, toHz: 92, gain: 0.09 });
      this.tone(context, { type: "triangle", start, duration: 1.18, fromHz: 172, toHz: 184, gain: 0.035 });
      for (let index = 0; index < 5; index += 1) {
        this.noiseBurst(context, {
          start: start + 0.12 + index * 0.18,
          duration: 0.035,
          frequencyHz: 520,
          gain: 0.025
        });
      }
    });
  }

  whoosh(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, {
        start,
        duration: 0.55,
        frequencyHz: 760,
        gain: 0.13,
        sweepToHz: 1900
      });
      this.tone(context, { type: "sine", start: start + 0.04, duration: 0.36, fromHz: 220, toHz: 440, gain: 0.05 });
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
    if (this.context) {
      return this.context;
    }
    const Ctor = audioContextConstructor();
    if (!Ctor) {
      this.unavailable = true;
      return undefined;
    }
    try {
      this.context = new Ctor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = clamp(this.options.volume ?? 0.28, 0, 1);
      this.masterGain.connect(this.context.destination);
      return this.context;
    } catch {
      this.unavailable = true;
      return undefined;
    }
  }

  private tone(
    context: AudioContext,
    options: {
      type: OscillatorType;
      start: number;
      duration: number;
      fromHz: number;
      toHz: number;
      gain: number;
    }
  ): void {
    const output = this.masterGain;
    if (!output) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.fromHz, options.start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.toHz), options.start + options.duration);
    gain.gain.setValueAtTime(0.0001, options.start);
    gain.gain.linearRampToValueAtTime(options.gain, options.start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, options.start + options.duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(options.start);
    oscillator.stop(options.start + options.duration + 0.02);
  }

  private noiseBurst(
    context: AudioContext,
    options: {
      start: number;
      duration: number;
      frequencyHz: number;
      gain: number;
      sweepToHz?: number;
    }
  ): void {
    const output = this.masterGain;
    if (!output) {
      return;
    }
    const buffer = context.createBuffer(1, Math.max(1, Math.ceil(context.sampleRate * options.duration)), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(options.frequencyHz, options.start);
    if (options.sweepToHz !== undefined) {
      filter.frequency.linearRampToValueAtTime(options.sweepToHz, options.start + options.duration);
    }
    gain.gain.setValueAtTime(0.0001, options.start);
    gain.gain.linearRampToValueAtTime(options.gain, options.start + Math.min(0.02, options.duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, options.start + options.duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(options.start);
    source.stop(options.start + options.duration + 0.01);
  }
}

export function createTransitionSfx(options: TransitionSfxOptions = {}): TransitionSfx {
  return audioContextConstructor() ? new WebAudioTransitionSfx(options) : new NoopTransitionSfx();
}

function audioContextConstructor(): AudioContextConstructor | undefined {
  const audioGlobal = globalThis as typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
