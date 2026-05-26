import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/review",
  timeout: 30_000,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["line"]
  ],
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
    }
  ]
});
