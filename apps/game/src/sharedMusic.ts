import type Phaser from "phaser";
import type { MusicManifest } from "@eb/schemas";
import { createMusic, type Music, type MusicOptions } from "./audio/music";

const REGISTRY_KEY = "swag:sharedMusic";

/**
 * One music engine for the whole game, stored in the (game-wide) Phaser registry
 * so the world and battle scenes share it. Created once on first use; every later
 * scene reuses the same instance — which means its decoded-audio buffer cache
 * persists across scene transitions, so battle-in/battle-out music switches are
 * near-instant instead of re-fetching and re-decoding the track each time.
 */
export function getSharedMusic(
  registry: Phaser.Data.DataManager,
  manifest: MusicManifest | undefined,
  options: MusicOptions = {}
): Music {
  const existing = registry.get(REGISTRY_KEY) as Music | undefined;
  if (existing) {
    // A new scene is taking over: re-assert the real enabled state so a transient
    // mute (e.g. the dev Track Lab auditioning over the previous scene) can't leak
    // in and silence the next scene's music. Stays disabled only when ?nomusic.
    existing.setEnabled(options.enabled ?? !options.muted);
    return existing;
  }
  const music = createMusic(manifest, options);
  registry.set(REGISTRY_KEY, music);
  return music;
}
