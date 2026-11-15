import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry", actionTimeout: 15_000 },
  webServer: { command: "npm run start", url: "http://127.0.0.1:3000", reuseExistingServer: true },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, browserName: "chromium", channel: "chrome" } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, browserName: "chromium", channel: "chrome" } }
  ]
});
