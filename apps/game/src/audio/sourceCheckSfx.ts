import { audioContextAvailable, sharedAudioContext } from "./sharedAudioContext";

export type SourceCheckCardRarity = "common" | "holo" | "source-grade";

export interface SourceCheckSfx {
  resume(): void;
  menuMove(): void;
  answerLock(): void;
  correct(streakStep: number): void;
  wrong(): void;
  ceremony(): void;
  raritySting(rarity: SourceCheckCardRarity): void;
}

export type SourceCheckSfxCue =
  | "menuMove"
  | "answerLock"
  | "correct"
  | "wrong"
  | "ceremony"
  | `rarity:${SourceCheckCardRarity}`;

export type SourceCheckSfxOptions = {
  muted?: boolean;
  volume?: number;
};

export const SOURCE_CHECK_SFX_MASTER_GAIN = 0.58;

export class NoopSourceCheckSfx implements SourceCheckSfx {
  resume(): void {}
  menuMove(): void {}
  answerLock(): void {}
  correct(): void {}
  wrong(): void {}
  ceremony(): void {}
  raritySting(): void {}
}

export class WebAudioSourceCheckSfx implements SourceCheckSfx {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private unavailable = false;

  constructor(private readonly options: SourceCheckSfxOptions = {}) {}

  resume(): void {
    const context = this.audioContext();
    if (!context || context.state !== "suspended") {
      return;
    }
    void context.resume().catch(() => {
      this.unavailable = true;
    });
  }

  menuMove(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "square", start, duration: 0.038, fromHz: 580, toHz: 710, gain: 0.055 });
    });
  }

  answerLock(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "triangle", start, duration: 0.055, fromHz: 520, toHz: 700, gain: 0.07 });
      this.tone(context, { type: "sine", start: start + 0.042, duration: 0.055, fromHz: 820, toHz: 900, gain: 0.04 });
    });
  }

  correct(streakStep: number): void {
    this.withContext((context) => {
      const start = context.currentTime;
      const shift = semitone(Math.max(0, Math.min(11, Math.floor(streakStep))));
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((note, index) => {
        const at = start + index * 0.052;
        this.tone(context, {
          type: "triangle",
          start: at,
          duration: 0.105,
          fromHz: note * shift,
          toHz: note * shift * 1.006,
          gain: index === notes.length - 1 ? 0.058 : 0.048
        });
      });
    });
  }

  wrong(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "sine", start, duration: 0.15, fromHz: 250, toHz: 142, gain: 0.068 });
      this.tone(context, { type: "triangle", start: start + 0.025, duration: 0.11, fromHz: 164, toHz: 110, gain: 0.038 });
      this.noiseBurst(context, { start: start + 0.012, duration: 0.07, frequencyHz: 330, sweepToHz: 190, gain: 0.024 });
    });
  }

  ceremony(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      const notes = [392, 493.88, 587.33, 783.99];
      notes.forEach((note, index) => {
        const at = start + index * 0.078;
        this.tone(context, {
          type: "triangle",
          start: at,
          duration: index === notes.length - 1 ? 0.22 : 0.1,
          fromHz: note,
          toHz: note * 1.004,
          gain: index === notes.length - 1 ? 0.072 : 0.055
        });
      });
      this.tone(context, { type: "sine", start: start + 0.23, duration: 0.28, fromHz: 392, toHz: 523.25, gain: 0.035 });
    });
  }

  raritySting(rarity: SourceCheckCardRarity): void {
    this.withContext((context) => {
      const start = context.currentTime;
      if (rarity === "source-grade") {
        const flourish = start + 0.18;
        [659.25, 987.77, 1318.51, 1760].forEach((note, index) => {
          this.tone(context, {
            type: index === 0 ? "sine" : "triangle",
            start: flourish + index * 0.055,
            duration: index === 3 ? 0.19 : 0.09,
            fromHz: note,
            toHz: note * 1.01,
            gain: index === 3 ? 0.074 : 0.052
          });
        });
        this.noiseBurst(context, { start: flourish + 0.09, duration: 0.18, frequencyHz: 1800, sweepToHz: 3200, gain: 0.018 });
        return;
      }
      if (rarity === "holo") {
        [523.25, 659.25, 880, 1174.66].forEach((note, index) => {
          this.tone(context, {
            type: "triangle",
            start: start + index * 0.045,
            duration: index === 3 ? 0.16 : 0.08,
            fromHz: note,
            toHz: note * 1.012,
            gain: index === 3 ? 0.066 : 0.045
          });
        });
        return;
      }
      this.tone(context, { type: "triangle", start, duration: 0.13, fromHz: 659.25, toHz: 783.99, gain: 0.055 });
      this.tone(context, { type: "sine", start: start + 0.08, duration: 0.14, fromHz: 783.99, toHz: 987.77, gain: 0.04 });
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
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = clamp(this.options.volume ?? SOURCE_CHECK_SFX_MASTER_GAIN, 0, 1);
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
    oscillator.frequency.setValueAtTime(Math.max(1, options.fromHz), options.start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.toHz), options.start + options.duration);
    gain.gain.setValueAtTime(0.0001, options.start);
    gain.gain.linearRampToValueAtTime(options.gain, options.start + Math.min(0.014, options.duration / 3));
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
    filter.frequency.setValueAtTime(Math.max(1, options.frequencyHz), options.start);
    if (options.sweepToHz !== undefined) {
      filter.frequency.linearRampToValueAtTime(Math.max(1, options.sweepToHz), options.start + options.duration);
    }
    gain.gain.setValueAtTime(0.0001, options.start);
    gain.gain.linearRampToValueAtTime(options.gain, options.start + Math.min(0.018, options.duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, options.start + options.duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(options.start);
    source.stop(options.start + options.duration + 0.01);
  }
}

export function createSourceCheckSfx(options: SourceCheckSfxOptions = {}): SourceCheckSfx {
  return audioContextAvailable() ? new WebAudioSourceCheckSfx(options) : new NoopSourceCheckSfx();
}

function semitone(steps: number): number {
  return 2 ** (steps / 12);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
