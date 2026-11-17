import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#][^=]*)=(.*)$/);
  if (!match || process.env[match[1].trim()]) continue;
  process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required");
const response = await fetch(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`, {
  headers: { Referer: "https://dovid-logistics-prelaunch.netlify.app/admin/coverage" },
});
const script = await response.text();
const knownErrors = ["RefererNotAllowedMapError", "ApiNotActivatedMapError", "BillingNotEnabledMapError", "InvalidKeyMapError", "ExpiredKeyMapError", "OverQuotaMapError"];
const result = {
  httpStatus: response.status,
  contentType: response.headers.get("content-type"),
  detectedErrors: knownErrors.filter((error) => script.includes(error)),
  mapsApiLoaded: script.includes("google.maps"),
};
console.log(JSON.stringify(result, null, 2));
if (!response.ok || result.detectedErrors.length > 0 || !result.mapsApiLoaded) {
  throw new Error("The deployed-host browser key did not pass Maps JavaScript API validation");
}
