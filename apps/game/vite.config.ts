import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Dev-only load/save endpoint for building-editor.html — reads and writes
 * content/building-overrides.json so building placements can be tuned visually.
 */
function buildingOverridesPlugin(): Plugin {
  const file = join(ROOT, "..", "..", "content", "building-overrides.json");
  return {
    name: "swag-building-overrides",
    configureServer(server) {
      server.middlewares.use("/__building-overrides", (req, res) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try { JSON.parse(body); writeFileSync(file, body.endsWith("\n") ? body : body + "\n"); res.statusCode = 200; res.end("ok"); }
            catch (e) { res.statusCode = 400; res.end(String(e)); }
          });
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(file, "utf8"));
      });
    }
  };
}

export default defineConfig({
  plugins: [audioListPlugin(), buildingOverridesPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
