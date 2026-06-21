import type { MusicManifest } from "@eb/schemas";

export interface Music {
  play(cue: string): Promise<void>;
  stop(): void;
  resume(): void;
  setEnabled(enabled: boolean): void;
}

export type MusicOptions = {
  muted?: boolean;
  enabled?: boolean;
  fadeMs?: number;
  masterGain?: number;
  baseUrl?: string;
  fetch?: typeof fetch;
  logger?: Pick<Console, "warn">;
  audioContextConstructor?: AudioContextConstructor;
};

export type ResolvedMusicCue = {
  cue: string;
  file: string;
  loop: boolean;
  gain: number;
};

export type AudioContextConstructor = new () => AudioContext;

export const DEFAULT_MUSIC_CUE_GAIN = 0.45;
export const DEFAULT_MUSIC_MASTER_GAIN = 0.82;
export const MUSIC_AREA_CUE_PREFIX = "area:";
export type MusicAreaCueId = `${typeof MUSIC_AREA_CUE_PREFIX}${string}`;
const DEFAULT_FADE_MS = 650;
const MIN_GAIN = 0.0001;

type PlayingTrack = {
  cue: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
};

export class NoopMusic implements Music {
  async play(): Promise<void> {}
  stop(): void {}
  resume(): void {}
  setEnabled(): void {}
}

export class WebAudioMusic implements Music {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private unavailable = false;
  private enabled: boolean;
  private current?: PlayingTrack;
  private requestedCue?: string;
  private pendingCue?: string;
  private readonly bufferCache = new Map<string, Promise<AudioBuffer | undefined>>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly manifest: MusicManifest | undefined,
    private readonly options: MusicOptions = {}
  ) {
    this.enabled = options.enabled ?? !options.muted;
  }

  async play(cue: string): Promise<void> {
    this.requestedCue = cue;
    if (!this.enabled || this.current?.cue === cue || this.pendingCue === cue) {
      return;
    }

    const resolved = resolveMusicCue(this.manifest, cue);
    if (!resolved) {
      return;
    }

    const context = this.audioContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => {
        this.unavailable = true;
      });
    }

    this.pendingCue = cue;
    const buffer = await this.loadBuffer(resolved);
    if (this.pendingCue !== cue || this.requestedCue !== cue || !this.enabled) {
      return;
    }
    this.pendingCue = undefined;

    if (!buffer) {
      this.fadeOutCurrent(context);
      return;
    }

    this.startTrack(context, resolved, buffer);
  }

  stop(): void {
    this.requestedCue = undefined;
    this.pendingCue = undefined;
    if (this.context) {
      this.fadeOutCurrent(this.context);
      return;
    }
    this.current = undefined;
  }

  resume(): void {
    if (!this.enabled) {
      return;
    }
    const context = this.audioContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => {
        this.unavailable = true;
      });
    }
    if (!this.current && this.requestedCue) {
      void this.play(this.requestedCue);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.pendingCue = undefined;
      if (this.context) {
        this.fadeOutCurrent(this.context);
      } else {
        this.current = undefined;
      }
      return;
    }
    if (this.requestedCue) {
      void this.play(this.requestedCue);
    } else {
      this.resume();
    }
  }

  private startTrack(context: AudioContext, cue: ResolvedMusicCue, buffer: AudioBuffer): void {
    const output = this.masterGain;
    if (!output) {
      return;
    }

    const previous = this.current;
    const now = context.currentTime;
    const fadeSeconds = this.fadeSeconds();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = cue.loop;
    gain.gain.setValueAtTime(MIN_GAIN, now);
    gain.gain.linearRampToValueAtTime(clamp(cue.gain, 0, 1), now + fadeSeconds);
    source.connect(gain);
    gain.connect(output);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(now);

    this.current = { cue: cue.cue, source, gain };
    if (previous) {
      this.fadeTrack(context, previous);
    }
  }

  private fadeOutCurrent(context: AudioContext): void {
    const current = this.current;
    if (!current) {
      return;
    }
    this.current = undefined;
    this.fadeTrack(context, current);
  }

  private fadeTrack(context: AudioContext, track: PlayingTrack): void {
    const now = context.currentTime;
    const fadeSeconds = this.fadeSeconds();
    try {
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(Math.max(track.gain.gain.value, MIN_GAIN), now);
      track.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      track.source.stop(now + fadeSeconds + 0.05);
    } catch {
      try {
        track.source.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  private async loadBuffer(cue: ResolvedMusicCue): Promise<AudioBuffer | undefined> {
    const cached = this.bufferCache.get(cue.file);
    if (cached) {
      return cached;
    }
    const promise = this.fetchAndDecode(cue);
    this.bufferCache.set(cue.file, promise);
    return promise;
  }

  private async fetchAndDecode(cue: ResolvedMusicCue): Promise<AudioBuffer | undefined> {
    const context = this.audioContext();
    const fetchMusic = this.options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!context || !fetchMusic) {
      return undefined;
    }

    try {
      const response = await fetchMusic(publicMusicUrl(cue.file, this.options.baseUrl));
      if (response.ok === false) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.arrayBuffer();
      return await context.decodeAudioData(data.slice(0));
    } catch {
      this.warnOnce(
        `load:${cue.file}`,
        `Music cue "${cue.cue}" is unavailable at ${cue.file}; staying silent.`
      );
      return undefined;
    }
  }

  private audioContext(): AudioContext | undefined {
    if (this.unavailable || !this.enabled) {
      return undefined;
    }
    if (this.context) {
      return this.context;
    }
    const Ctor = this.options.audioContextConstructor ?? audioContextConstructor();
    if (!Ctor) {
      this.unavailable = true;
      return undefined;
    }
    try {
      this.context = new Ctor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = clamp(this.options.masterGain ?? DEFAULT_MUSIC_MASTER_GAIN, 0, 1);
      this.masterGain.connect(this.context.destination);
      return this.context;
    } catch {
      this.unavailable = true;
      return undefined;
    }
  }

  private fadeSeconds(): number {
    return Math.max(0, this.options.fadeMs ?? DEFAULT_FADE_MS) / 1000;
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) {
      return;
    }
    this.warned.add(key);
    (this.options.logger ?? console).warn(message);
  }
}

export function createMusic(manifest?: MusicManifest, options: MusicOptions = {}): Music {
  if (options.muted || options.enabled === false) {
    return new NoopMusic();
  }
  const Ctor = options.audioContextConstructor ?? audioContextConstructor();
  return Ctor ? new WebAudioMusic(manifest, { ...options, audioContextConstructor: Ctor }) : new NoopMusic();
}

export function resolveMusicCue(manifest: MusicManifest | undefined, cue: string): ResolvedMusicCue | undefined {
  const areaCue = resolveAreaMusicCue(manifest, cue);
  if (areaCue) {
    return areaCue;
  }
  const entry = manifest?.cues[cue];
  if (!entry) {
    return undefined;
  }
  return {
    cue,
    file: entry.file,
    loop: entry.loop ?? true,
    gain: clamp(entry.gain ?? DEFAULT_MUSIC_CUE_GAIN, 0, 1)
  };
}

export function musicAreaCueId(id: string): MusicAreaCueId {
  return `${MUSIC_AREA_CUE_PREFIX}${id}` as MusicAreaCueId;
}

function resolveAreaMusicCue(manifest: MusicManifest | undefined, cue: string): ResolvedMusicCue | undefined {
  if (!cue.startsWith(MUSIC_AREA_CUE_PREFIX)) {
    return undefined;
  }
  const id = cue.slice(MUSIC_AREA_CUE_PREFIX.length);
  const entry = manifest?.areas?.find((area) => area.id === id);
  if (!entry) {
    return undefined;
  }
  return {
    cue,
    file: entry.file,
    loop: entry.loop ?? true,
    gain: clamp(entry.gain ?? DEFAULT_MUSIC_CUE_GAIN, 0, 1)
  };
}

export function publicMusicUrl(file: string, baseUrl = "/"): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${file.replace(/^\/+/, "")}`;
}

export function musicDisabledBySearch(search: string | undefined): boolean {
  return new URLSearchParams(search ?? "").get("nomusic") === "1";
}

function audioContextConstructor(): AudioContextConstructor | undefined {
  const audioGlobal = globalThis as typeof globalThis & {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
