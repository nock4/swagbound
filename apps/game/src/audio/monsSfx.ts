import { audioContextAvailable, sharedAudioContext } from "./sharedAudioContext";

export interface MonsSfx {
  resume(): void;
  catchSuccess(): void;
  negotiationRight(step: number): void;
  negotiationWrong(): void;
  fusionPoof(): void;
  petChirp(): void;
  altarHum(): void;
  placeThunk(): void;
  buildRaise(): void;
  sellRefund(): void;
  productionReady(): void;
  coinPayout(count?: number): void;
  gachaRattle(): void;
  gachaDrop(): void;
  ratingUp(): void;
  chirpVariant(index: number): void;
}

export type MonsSfxOptions = {
  muted?: boolean;
  volume?: number;
};

export const MONS_SFX_MASTER_GAIN = 0.55;

export class NoopMonsSfx implements MonsSfx {
  resume(): void {}
  catchSuccess(): void {}
  negotiationRight(): void {}
  negotiationWrong(): void {}
  fusionPoof(): void {}
  petChirp(): void {}
  altarHum(): void {}
  placeThunk(): void {}
  buildRaise(): void {}
  sellRefund(): void {}
  productionReady(): void {}
  coinPayout(): void {}
  gachaRattle(): void {}
  gachaDrop(): void {}
  ratingUp(): void {}
  chirpVariant(): void {}
}

export class WebAudioMonsSfx implements MonsSfx {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private unavailable = false;

  constructor(private readonly options: MonsSfxOptions = {}) {}

  resume(): void {
    const context = this.audioContext();
    if (!context || context.state !== "suspended") {
      return;
    }
    void context.resume().catch(() => {
      this.unavailable = true;
    });
  }

  catchSuccess(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      const notes = [392, 493.88, 587.33, 783.99, 987.77];
      notes.forEach((note, index) => {
        const at = start + index * 0.075;
        this.tone(context, {
          type: "triangle",
          start: at,
          duration: index === notes.length - 1 ? 0.3 : 0.13,
          fromHz: note,
          toHz: note * 1.006,
          gain: index === notes.length - 1 ? 0.072 : 0.052
        });
      });
    });
  }

  negotiationRight(step: number): void {
    this.withContext((context) => {
      const start = context.currentTime;
      const shift = semitone(Math.max(0, Math.min(11, Math.floor(step))));
      this.tone(context, {
        type: "triangle",
        start,
        duration: 0.12,
        fromHz: 659.25 * shift,
        toHz: 783.99 * shift,
        gain: 0.056
      });
    });
  }

  negotiationWrong(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "sine", start, duration: 0.18, fromHz: 329.63, toHz: 246.94, gain: 0.056 });
      this.tone(context, {
        type: "triangle",
        start: start + 0.04,
        duration: 0.16,
        fromHz: 246.94,
        toHz: 196,
        gain: 0.038
      });
    });
  }

  fusionPoof(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.38, frequencyHz: 1800, sweepToHz: 320, gain: 0.044 });
      [987.77, 1318.51, 1760].forEach((note, index) => {
        this.tone(context, {
          type: index === 1 ? "sine" : "triangle",
          start: start + 0.08 + index * 0.065,
          duration: index === 2 ? 0.16 : 0.1,
          fromHz: note,
          toHz: note * 1.012,
          gain: index === 1 ? 0.04 : 0.034
        });
      });
    });
  }

  petChirp(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "triangle", start, duration: 0.055, fromHz: 659.25, toHz: 698.46, gain: 0.046 });
      this.tone(context, {
        type: "sine",
        start: start + 0.038,
        duration: 0.055,
        fromHz: 783.99,
        toHz: 880,
        gain: 0.04
      });
    });
  }

  altarHum(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, {
        type: "sine",
        start,
        duration: 0.9,
        fromHz: 110,
        toHz: 109.5,
        gain: 0.052,
        attack: 0.26
      });
      this.tone(context, {
        type: "triangle",
        start: start + 0.04,
        duration: 0.82,
        fromHz: 164.81,
        toHz: 165.5,
        gain: 0.032,
        attack: 0.3
      });
    });
  }

  placeThunk(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.12, frequencyHz: 120, sweepToHz: 90, gain: 0.034 });
      this.tone(context, {
        type: "triangle",
        start: start + 0.012,
        duration: 0.16,
        fromHz: 180,
        toHz: 120,
        gain: 0.052
      });
    });
  }

  buildRaise(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.25, frequencyHz: 260, sweepToHz: 900, gain: 0.03 });
      this.tone(context, {
        type: "sine",
        start: start + 0.02,
        duration: 0.23,
        fromHz: 200,
        toHz: 600,
        gain: 0.034
      });
    });
  }

  sellRefund(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      [987.77, 783.99].forEach((note, index) => {
        this.tone(context, {
          type: "triangle",
          start: start + index * 0.085,
          duration: 0.1,
          fromHz: note,
          toHz: note * 0.78,
          gain: index === 0 ? 0.046 : 0.042
        });
      });
    });
  }

  productionReady(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, {
        type: "triangle",
        start,
        duration: 0.15,
        fromHz: 523.25,
        toHz: 526,
        gain: 0.045
      });
      this.tone(context, {
        type: "triangle",
        start: start + 0.1,
        duration: 0.21,
        fromHz: 783.99,
        toHz: 788,
        gain: 0.055
      });
      this.tone(context, {
        type: "sine",
        start: start + 0.15,
        duration: 0.13,
        fromHz: 1567.98,
        toHz: 1580,
        gain: 0.03
      });
    });
  }

  coinPayout(count?: number): void {
    this.withContext((context) => {
      const start = context.currentTime;
      const requestedCount = count ?? 3;
      const blipCount = Math.max(1, Math.min(6, Math.floor(Number.isFinite(requestedCount) ? requestedCount : 3)));
      for (let index = 0; index < blipCount; index += 1) {
        const note = 659.25 * semitone(index * 2);
        this.tone(context, {
          type: "triangle",
          start: start + index * 0.052,
          duration: 0.085,
          fromHz: note,
          toHz: note * 1.08,
          gain: 0.044
        });
      }
    });
  }

  gachaRattle(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      [1500, 1050, 1750, 1250].forEach((frequencyHz, index) => {
        this.noiseBurst(context, {
          start: start + index * 0.04,
          duration: 0.032,
          frequencyHz,
          sweepToHz: frequencyHz * 0.82,
          gain: 0.03 + (index % 2) * 0.004
        });
      });
    });
  }

  gachaDrop(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, {
        type: "triangle",
        start,
        duration: 0.14,
        fromHz: 493.88,
        toHz: 196,
        gain: 0.04
      });
      this.noiseBurst(context, {
        start: start + 0.105,
        duration: 0.07,
        frequencyHz: 1800,
        sweepToHz: 1000,
        gain: 0.034
      });
      this.tone(context, {
        type: "sine",
        start: start + 0.115,
        duration: 0.1,
        fromHz: 987.77,
        toHz: 1318.51,
        gain: 0.042
      });
    });
  }

  ratingUp(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
        this.tone(context, {
          type: index === 2 ? "sine" : "triangle",
          start: start + index * 0.09,
          duration: index === 3 ? 0.22 : 0.13,
          fromHz: note,
          toHz: note * 1.008,
          gain: index === 3 ? 0.056 : 0.042
        });
      });
      this.tone(context, {
        type: "sine",
        start: start + 0.32,
        duration: 0.16,
        fromHz: 1567.98,
        toHz: 2093,
        gain: 0.03
      });
    });
  }

  chirpVariant(index: number): void {
    this.withContext((context) => {
      const start = context.currentTime;
      const variants = [
        { firstType: "triangle", secondType: "sine", pitches: [587.33, 659.25, 698.46, 783.99] },
        { firstType: "sine", secondType: "triangle", pitches: [698.46, 783.99, 880, 987.77] },
        { firstType: "triangle", secondType: "triangle", pitches: [523.25, 587.33, 783.99, 880] },
        { firstType: "sine", secondType: "triangle", pitches: [783.99, 739.99, 880, 1046.5] }
      ] as const;
      const variantIndex = Math.max(0, Math.min(3, Math.floor(Number.isFinite(index) ? index : 0)));
      const variant = variants[variantIndex];
      this.tone(context, {
        type: variant.firstType,
        start,
        duration: 0.052 + variantIndex * 0.004,
        fromHz: variant.pitches[0],
        toHz: variant.pitches[1],
        gain: 0.044
      });
      this.tone(context, {
        type: variant.secondType,
        start: start + 0.036 + variantIndex * 0.003,
        duration: 0.056 + variantIndex * 0.004,
        fromHz: variant.pitches[2],
        toHz: variant.pitches[3],
        gain: 0.038
      });
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
      this.masterGain.gain.value = clamp(this.options.volume ?? MONS_SFX_MASTER_GAIN, 0, 1);
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
      attack?: number;
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
    gain.gain.linearRampToValueAtTime(
      options.gain,
      options.start + Math.min(options.attack ?? 0.014, options.duration / 3)
    );
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

export function createMonsSfx(options: MonsSfxOptions = {}): MonsSfx {
  return audioContextAvailable() ? new WebAudioMonsSfx(options) : new NoopMonsSfx();
}

function semitone(steps: number): number {
  return 2 ** (steps / 12);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
