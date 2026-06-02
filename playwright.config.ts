import { defineConfig, devices, type ReporterDescription } from "@playwright/test";
import { devices as replayDevices, replayReporter } from "@replayio/playwright";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const baseReporters: ReporterDescription[] = [
  ["html", { outputFolder: "playwright-report", open: "never" }],
  ["line"]
];

const reporter: ReporterDescription[] = process.env.REPLAY_API_KEY
  ? [
      replayReporter({
        apiKey: process.env.REPLAY_API_KEY,
        upload: true
      }) as ReporterDescription,
      ...baseReporters
    ]
  : baseReporters;

export default defineConfig({
  testDir: "tests/review",
  timeout: 30_000,
  reporter,
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5173/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    {
      name: "review-chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173/",
        viewport: { width: 1000, height: 760 },
        trace: "on",
        video: "on",
        screenshot: "on"
      }
    },
    {
      name: "replay-chromium",
      use: {
        ...replayDevices["Replay Chromium"],
        baseURL: "http://127.0.0.1:5173/",
        viewport: { width: 1000, height: 760 },
        trace: "on",
        video: "on",
        screenshot: "on"
      }
    }
  ]
});
