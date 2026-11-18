import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#][^=]*)=(.*)$/);
  if (!match || process.env[match[1].trim()]) continue;
  process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required");

const checkUrl = "https://dovid-logistics-prelaunch.netlify.app/__maps-browser-key-check";
const knownErrors = ["RefererNotAllowedMapError", "ApiNotActivatedMapError", "BillingNotEnabledMapError", "InvalidKeyMapError", "ExpiredKeyMapError", "OverQuotaMapError"];
const detectedErrors = new Set();
const requestFailures = [];
const providerResponses = [];
const browser = await chromium.launch({ channel: "chrome" });

let status = "timeout";
try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    for (const error of knownErrors) if (message.text().includes(error)) detectedErrors.add(error);
  });
  page.on("pageerror", (error) => {
    for (const knownError of knownErrors) if (error.message.includes(knownError)) detectedErrors.add(knownError);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
      requestFailures.push({ host: url.hostname, path: url.pathname, error: request.failure()?.errorText ?? "unknown" });
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
      providerResponses.push({ host: url.hostname, path: url.pathname, status: response.status() });
    }
  });
  await page.route(checkUrl, (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta name="referrer" content="strict-origin-when-cross-origin"></head><body><div id="map"></div><script>window.__dovidMapsStatus="loading";window.gm_authFailure=()=>{window.__dovidMapsStatus="authentication"};window.__dovidMapsLoaded=()=>{window.__dovidMapsStatus=window.google?.maps?"loaded":"missing"}</script><script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__dovidMapsLoaded"></script></body></html>`,
  }));
  await page.goto(checkUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__dovidMapsStatus !== "loading", undefined, { timeout: 20_000 }).catch(() => undefined);
  status = await page.evaluate(() => window.__dovidMapsStatus ?? "missing");
} finally {
  await browser.close();
}

const result = {
  origin: new URL(checkUrl).origin,
  status,
  detectedErrors: [...detectedErrors],
  requestFailures,
  providerResponses,
  mapsApiLoaded: status === "loaded" && detectedErrors.size === 0,
};
console.log(JSON.stringify(result, null, 2));
if (!result.mapsApiLoaded) throw new Error("The deployed-host browser key did not pass executable Maps JavaScript API validation");
