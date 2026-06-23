export interface BattleSfx {
  resume(): void;
  menuMove(): void;
  menuConfirm(): void;
  menuCancel(): void;
  swing(): void;
  hit(): void;
  smash(): void;
  crit(): void;
  defend(): void;
  miss(): void;
  psi(): void;
  heal(): void;
  hpTick(): void;
  enemyDown(): void;
  run(): void;
  victory(): void;
  levelUp(): void;
}

export type BattleSfxCue = Exclude<keyof BattleSfx, "resume">;

export type BattleSfxOptions = {
  muted?: boolean;
  volume?: number;
};

type AudioContextConstructor = new () => AudioContext;

export const BATTLE_SFX_MASTER_GAIN = 0.68;

export class NoopBattleSfx implements BattleSfx {
  resume(): void {}
  menuMove(): void {}
  menuConfirm(): void {}
  menuCancel(): void {}
  swing(): void {}
  hit(): void {}
  smash(): void {}
  crit(): void {}
  defend(): void {}
  miss(): void {}
  psi(): void {}
  heal(): void {}
  hpTick(): void {}
  enemyDown(): void {}
  run(): void {}
  victory(): void {}
  levelUp(): void {}
}

export class WebAudioBattleSfx implements BattleSfx {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private unavailable = false;

  constructor(private readonly options: BattleSfxOptions = {}) {}

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
      this.tone(context, { type: "square", start, duration: 0.045, fromHz: 520, toHz: 620, gain: 0.08 });
    });
  }

  menuConfirm(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "triangle", start, duration: 0.055, fromHz: 560, toHz: 740, gain: 0.11 });
      this.tone(context, { type: "sine", start: start + 0.045, duration: 0.075, fromHz: 880, toHz: 1040, gain: 0.07 });
    });
  }

  menuCancel(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "triangle", start, duration: 0.09, fromHz: 420, toHz: 180, gain: 0.1 });
      this.noiseBurst(context, { start: start + 0.01, duration: 0.045, frequencyHz: 460, gain: 0.025 });
    });
  }

  swing(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.16, frequencyHz: 520, sweepToHz: 1500, gain: 0.09 });
      this.tone(context, { type: "sine", start: start + 0.015, duration: 0.13, fromHz: 180, toHz: 330, gain: 0.035 });
    });
  }

  hit(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.075, frequencyHz: 310, gain: 0.13 });
      this.tone(context, { type: "triangle", start, duration: 0.11, fromHz: 150, toHz: 82, gain: 0.12 });
    });
  }

  smash(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.12, frequencyHz: 190, gain: 0.2 });
      this.noiseBurst(context, { start: start + 0.018, duration: 0.09, frequencyHz: 740, gain: 0.1 });
      this.tone(context, { type: "sawtooth", start, duration: 0.17, fromHz: 110, toHz: 48, gain: 0.14 });
    });
  }

  crit(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.15, frequencyHz: 130, gain: 0.24 });
      this.tone(context, { type: "sawtooth", start, duration: 0.22, fromHz: 96, toHz: 38, gain: 0.16 });
      this.noiseBurst(context, { start: start + 0.02, duration: 0.12, frequencyHz: 920, sweepToHz: 2500, gain: 0.12 });
      this.tone(context, { type: "square", start: start + 0.05, duration: 0.18, fromHz: 320, toHz: 560, gain: 0.07 });
    });
  }

  defend(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.06, frequencyHz: 700, gain: 0.085 });
      this.tone(context, { type: "square", start, duration: 0.1, fromHz: 300, toHz: 430, gain: 0.075 });
      this.tone(context, { type: "sine", start: start + 0.05, duration: 0.13, fromHz: 200, toHz: 320, gain: 0.045 });
    });
  }

  miss(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.13, frequencyHz: 1300, sweepToHz: 420, gain: 0.055 });
      this.tone(context, { type: "sine", start: start + 0.02, duration: 0.11, fromHz: 520, toHz: 280, gain: 0.035 });
    });
  }

  psi(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "sine", start, duration: 0.22, fromHz: 420, toHz: 840, gain: 0.055 });
      this.tone(context, { type: "triangle", start: start + 0.04, duration: 0.2, fromHz: 630, toHz: 1260, gain: 0.045 });
      this.noiseBurst(context, { start: start + 0.02, duration: 0.18, frequencyHz: 1800, sweepToHz: 2600, gain: 0.035 });
    });
  }

  heal(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "sine", start, duration: 0.12, fromHz: 520, toHz: 660, gain: 0.06 });
      this.tone(context, { type: "sine", start: start + 0.075, duration: 0.14, fromHz: 660, toHz: 880, gain: 0.055 });
      this.tone(context, { type: "triangle", start: start + 0.15, duration: 0.16, fromHz: 880, toHz: 1320, gain: 0.04 });
    });
  }

  hpTick(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "square", start, duration: 0.026, fromHz: 880, toHz: 920, gain: 0.035 });
    });
  }

  enemyDown(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.tone(context, { type: "triangle", start, duration: 0.16, fromHz: 300, toHz: 180, gain: 0.09 });
      this.tone(context, { type: "sine", start: start + 0.11, duration: 0.18, fromHz: 180, toHz: 90, gain: 0.08 });
      this.noiseBurst(context, { start: start + 0.03, duration: 0.2, frequencyHz: 420, sweepToHz: 120, gain: 0.055 });
    });
  }

  run(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      this.noiseBurst(context, { start, duration: 0.32, frequencyHz: 640, sweepToHz: 1800, gain: 0.11 });
      this.tone(context, { type: "triangle", start: start + 0.02, duration: 0.24, fromHz: 220, toHz: 480, gain: 0.045 });
    });
  }

  victory(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((note, index) => {
        this.tone(context, {
          type: "triangle",
          start: start + index * 0.085,
          duration: 0.16,
          fromHz: note,
          toHz: note * 1.01,
          gain: index === notes.length - 1 ? 0.08 : 0.06
        });
      });
      this.tone(context, { type: "triangle", start, duration: 0.38, fromHz: 130.81, toHz: 131.5, gain: 0.05 });
      this.tone(context, { type: "sine", start: start + notes.length * 0.085, duration: 0.3, fromHz: 1046.5, toHz: 1318.5, gain: 0.05 });
    });
  }

  levelUp(): void {
    this.withContext((context) => {
      const start = context.currentTime;
      const notes = [392, 523.25, 659.25, 783.99, 1046.5];
      notes.forEach((note, index) => {
        const at = start + index * 0.078;
        this.tone(context, { type: "triangle", start: at, duration: 0.19, fromHz: note, toHz: note * 1.004, gain: 0.07 });
        this.tone(context, { type: "square", start: at, duration: 0.085, fromHz: note * 2, toHz: note * 2.004, gain: 0.022 });
      });
      const finale = start + notes.length * 0.078;
      this.tone(context, { type: "sine", start: finale, duration: 0.34, fromHz: 1046.5, toHz: 1568, gain: 0.05 });
      this.tone(context, { type: "triangle", start: finale, duration: 0.34, fromHz: 523.25, toHz: 784, gain: 0.04 });
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
      this.masterGain.gain.value = clamp(this.options.volume ?? BATTLE_SFX_MASTER_GAIN, 0, 1);
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

export function createBattleSfx(options: BattleSfxOptions = {}): BattleSfx {
  return audioContextConstructor() ? new WebAudioBattleSfx(options) : new NoopBattleSfx();
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
