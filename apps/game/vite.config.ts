import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";

const ROOT = dirname(fileURLToPath(import.meta.url));
const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".m4a", ".flac"]);

/**
 * Dev-only endpoint for the in-game "Track Lab" music auditioner: scans
 * public/audio recursively and returns every audio file as { name, url }.
 * Drop a new track in public/audio and refresh — no rebuild needed.
 */
function audioListPlugin(): Plugin {
  const audioRoot = join(ROOT, "public", "audio");
  return {
    name: "swag-audio-list",
    configureServer(server) {
      server.middlewares.use("/__audio-list", (_req, res) => {
        const tracks: Array<{ name: string; url: string }> = [];
        const walk = (dir: string): void => {
          let entries: ReturnType<typeof readdirSync>;
          try {
            entries = readdirSync(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const entry of entries) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (AUDIO_EXTENSIONS.has(extname(entry.name))) {
              const rel = relative(join(ROOT, "public"), full).split(/[\\/]/).join("/");
              tracks.push({ name: rel.replace(/^audio\//, ""), url: `/${rel}` });
            }
          }
        };
        walk(audioRoot);
        tracks.sort((a, b) => a.name.localeCompare(b.name));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ tracks }));
      });
    }
  };
}

function extname(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

export default defineConfig({
  plugins: [audioListPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
