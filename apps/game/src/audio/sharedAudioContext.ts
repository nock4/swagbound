type AudioContextConstructor = new () => AudioContext;

let sharedContext: AudioContext | undefined;
let unavailable = false;

export function sharedAudioContext(): AudioContext | undefined {
  if (unavailable) {
    return undefined;
  }
  if (sharedContext?.state === "closed") {
    sharedContext = undefined;
  }
  if (sharedContext) {
    return sharedContext;
  }
  const Ctor = audioContextConstructor();
  if (!Ctor) {
    unavailable = true;
    return undefined;
  }
  try {
    sharedContext = new Ctor();
    return sharedContext;
  } catch {
    unavailable = true;
    return undefined;
  }
}

export function audioContextAvailable(): boolean {
  return Boolean(audioContextConstructor()) && !unavailable;
}

function audioContextConstructor(): AudioContextConstructor | undefined {
  const audioGlobal = globalThis as typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
}
