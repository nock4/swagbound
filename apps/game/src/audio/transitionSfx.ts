import { audioContextAvailable, sharedAudioContext } from "./sharedAudioContext";

export interface TransitionSfx {
  resume(): void;
  doorOpen(): void;
  doorClose(): void;
  footsteps(): void;
  escalatorHum(): void;
  whoosh(): void;
  /** EarthBound-style battle-swirl sting played when an encounter starts. */
  encounter(): void;
  /** Soft per-character tick for typewriter dialogue text. */
  textBlip(): void;
  /** EarthBound low-HP "danger" heartbeat double-thump; called on an interval while a member is critical. */
  dangerHeartbeat(): void;
  /** Short muted tick when field poison drains a step of HP. */
  poisonTick(): void;
  /** Short confirm chirp when starting an in-world talk/sign interaction. */
  talkConfirm(): void;
  /** Small chime when a present opens. */
  presentOpen(): void;
  /** Bright jingle when an item is received. */
  itemGet(): void;
  /** Soft read cue for signs and examine hotspots. */
  readCue(): void;
}

export type InteractionSfxCue = "talkConfirm" | "presentOpen" | "itemGet" | "readCue";

export type TransitionSfxOptions = {
  muted?: boolean;
  volume?: number;
};

export const TRANSITION_SFX_MASTER_GAIN = 0.72;

export class NoopTransitionSfx implements TransitionSfx {
  resume(): void {}
  doorOpen(): void {}
  doorClose(): void {}
  footsteps(): void {}
  escalatorHum(): void {}
  whoosh(): void {}
  encounter(): void {}
  textBlip(): void {}
  dangerHeartbeat(): void {}
  poisonTick(): void {}
  talkConfirm(): void {}
  presentOpen(): void {}
  itemGet(): void {}
  readCue(): void {}
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

  encounter(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      // Fast warbling tone climbing in pitch (the EB battle-swirl "wa-wa-wa"), over
      // a rising noise sweep — ~0.6s to match the encounter swirl animation.
      for (let index = 0; index < 6; index += 1) {
        const t = start + index * 0.09;
        const base = 300 + index * 95;
        this.tone(context, { type: "square", start: t, duration: 0.06, fromHz: base, toHz: base * 1.5, gain: 0.06 });
        this.tone(context, { type: "sawtooth", start: t + 0.045, duration: 0.05, fromHz: base * 1.5, toHz: base, gain: 0.04 });
      }
      this.noiseBurst(context, { start, duration: 0.58, frequencyHz: 500, sweepToHz: 2600, gain: 0.06 });
    });
  }

  textBlip(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "square", start, duration: 0.022, fromHz: 620, toHz: 660, gain: 0.05 });
    });
  }

  dangerHeartbeat(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      // EB low-HP warning: a low "lub-dub" double-thump (two soft descending sine pulses).
      this.tone(context, { type: "sine", start, duration: 0.09, fromHz: 150, toHz: 90, gain: 0.11 });
      this.tone(context, { type: "sine", start: start + 0.14, duration: 0.11, fromHz: 130, toHz: 74, gain: 0.09 });
    });
  }

  poisonTick(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      // Sickly muted blip: a short bandpassed noise "bloop" with a low falling tone.
      this.noiseBurst(context, { start, duration: 0.12, frequencyHz: 320, sweepToHz: 180, gain: 0.05 });
      this.tone(context, { type: "triangle", start, duration: 0.12, fromHz: 240, toHz: 150, gain: 0.05 });
    });
  }

  talkConfirm(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "square", start, duration: 0.055, fromHz: 520, toHz: 780, gain: 0.055 });
      this.tone(context, { type: "triangle", start: start + 0.035, duration: 0.04, fromHz: 780, toHz: 620, gain: 0.035 });
    });
  }

  presentOpen(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "triangle", start, duration: 0.09, fromHz: 330, toHz: 660, gain: 0.08 });
      this.tone(context, { type: "sine", start: start + 0.065, duration: 0.12, fromHz: 660, toHz: 990, gain: 0.055 });
      this.noiseBurst(context, { start, duration: 0.08, frequencyHz: 1800, gain: 0.025 });
    });
  }

  itemGet(): void {
    this.withContext((context) => {
      const start = context.currentTime + 0.08;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((hz, index) => {
        this.tone(context, {
          type: index === notes.length - 1 ? "triangle" : "square",
          start: start + index * 0.075,
          duration: index === notes.length - 1 ? 0.18 : 0.07,
          fromHz: hz,
          toHz: hz * 1.01,
          gain: index === notes.length - 1 ? 0.075 : 0.055
        });
      });
    });
  }

  readCue(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "sine", start, duration: 0.06, fromHz: 880, toHz: 740, gain: 0.04 });
      this.tone(context, { type: "triangle", start: start + 0.055, duration: 0.07, fromHz: 660, toHz: 660, gain: 0.03 });
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
      this.masterGain.gain.value = clamp(this.options.volume ?? TRANSITION_SFX_MASTER_GAIN, 0, 1);
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
  return audioContextAvailable() ? new WebAudioTransitionSfx(options) : new NoopTransitionSfx();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
