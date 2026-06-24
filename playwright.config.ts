import { defineConfig, devices, type ReporterDescription } from "@playwright/test";
import { devices as replayDevices, replayReporter } from "@replayio/playwright";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const baseReporters: ReporterDescription[] = [
  ["html", { outputFolder: "playwright-report", open: "never" }],
  ["line"]
];

const reporter: ReporterDescription[] = process.env.PLAYWRIGHT_ENABLE_REPLAY === "1" && process.env.REPLAY_API_KEY && process.env.PLAYWRIGHT_DISABLE_REPLAY !== "1"
  ? [
      replayReporter({
        apiKey: process.env.REPLAY_API_KEY,
        upload: true
      }) as ReporterDescription,
      ...baseReporters
    ]
  : baseReporters;

const webServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
  ? undefined
  : {
      command: "pnpm dev:serve",
      url: "http://127.0.0.1:5173/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    };

export default defineConfig({
  testDir: "tests/review",
  timeout: 60_000,
  // The game tests are CPU-heavy (canvas rendering + video/trace capture per
  // worker). More than two concurrent browsers starves the render loop and
  // produces blank-canvas/slow-input flakes, so cap parallelism.
  workers: 2,
  reporter,
  webServer,
  projects: [
    {
      name: "review-chromium",
      testMatch: /(?:full-world|cutscenes)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173/",
        viewport: { width: 1000, height: 760 },
        // retain-on-failure: keep artifacts for failures only. "on" wrote a
        // video + multi-MB trace for every passing test across every run,
        // which filled the disk during the parity campaign.
        trace: "retain-on-failure",
        video: "retain-on-failure",
        screenshot: "only-on-failure"
      }
    },
    {
      name: "battle-chromium",
      testMatch: /(?:battle|encounters)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173/",
        viewport: { width: 1000, height: 760 },
        trace: "retain-on-failure",
        video: "retain-on-failure",
        screenshot: "only-on-failure"
      }
    },
    {
      name: "eb-reference-chromium",
      testMatch: /[/\\]eb[/\\].*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173/",
        viewport: { width: 1000, height: 760 },
        trace: "retain-on-failure",
        video: "retain-on-failure",
        screenshot: "only-on-failure"
      }
    },
    {
      name: "original-slice-chromium",
      testMatch: /original-slice\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173/",
        viewport: { width: 1000, height: 760 },
        trace: "retain-on-failure",
        video: "retain-on-failure",
        screenshot: "only-on-failure"
      }
    },
    {
      name: "replay-chromium",
      testMatch: /full-world\.spec\.ts/,
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
