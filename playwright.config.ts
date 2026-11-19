import { defineConfig, devices } from "@playwright/test";

const deployedBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const localBaseUrl = process.env.PLAYWRIGHT_LOCAL_BASE_URL ?? "http://127.0.0.1:3000";
const localPort = new URL(localBaseUrl).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: deployedBaseUrl ?? localBaseUrl, trace: "on-first-retry", actionTimeout: 15_000 },
  webServer: deployedBaseUrl ? undefined : { command: `npm run start -- -p ${localPort}`, url: localBaseUrl, reuseExistingServer: true },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, browserName: "chromium", channel: "chrome", hasTouch: true, isMobile: true } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, browserName: "chromium", channel: "chrome", hasTouch: true, isMobile: true } }
  ]
});
