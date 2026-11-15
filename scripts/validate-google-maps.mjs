import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadLocalEnvironment() {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]*)=(.*)$/);
    if (!match || process.env[match[1].trim()]) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnvironment();
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("GOOGLE_MAPS_API_KEY is required");

async function googleRequest(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Google Maps request failed with status ${response.status}`);
  return response.json();
}

async function resolvePlace(input) {
  const sessionToken = randomUUID();
  const autocomplete = await googleRequest("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text" },
    body: JSON.stringify({ input: `${input}, Ibadan`, includedRegionCodes: ["ng"], languageCode: "en", regionCode: "NG", sessionToken, locationBias: { circle: { center: { latitude: 7.3775, longitude: 3.947 }, radius: 50000 } } }),
  });
  const prediction = autocomplete.suggestions?.[0]?.placePrediction;
  if (!prediction?.placeId) throw new Error(`No place result for ${input}`);
  const details = await googleRequest(`https://places.googleapis.com/v1/places/${encodeURIComponent(prediction.placeId)}?languageCode=en&regionCode=NG&sessionToken=${encodeURIComponent(sessionToken)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "formattedAddress,location" },
  });
  return { label: input, address: details.formattedAddress, ...details.location };
}

async function route(origin, destination, intermediates = [], optimize = false) {
  const fieldMask = optimize ? "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex" : "routes.distanceMeters,routes.duration";
  const body = {
    origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
    destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
    intermediates: intermediates.map((stop) => ({ location: { latLng: { latitude: stop.latitude, longitude: stop.longitude } } })),
    travelMode: "TWO_WHEELER",
    routingPreference: "TRAFFIC_AWARE",
    optimizeWaypointOrder: optimize,
  };
  const result = await googleRequest("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask },
    body: JSON.stringify(body),
  });
  const selected = result.routes?.[0];
  if (!selected) throw new Error("Google returned no route");
  return { distanceMeters: selected.distanceMeters, durationSeconds: Math.ceil(Number.parseFloat(selected.duration)), optimizedIntermediateWaypointIndex: selected.optimizedIntermediateWaypointIndex ?? [] };
}

const places = Object.fromEntries(await Promise.all(["University of Ibadan", "Bodija Market", "Dugbe", "Akobo", "Oluyole Estate", "Moniya", "Ring Road"].map(async (label) => [label, await resolvePlace(label)])));
const results = {
  generatedAt: new Date().toISOString(),
  travelMode: "TWO_WHEELER",
  warning: "Provider travel times are planning estimates, not guaranteed motorcycle journey times.",
  short: await route(places["University of Ibadan"], places["Bodija Market"]),
  medium: await route(places.Akobo, places.Dugbe),
  long: await route(places.Moniya, places["Oluyole Estate"]),
  multiStop: await route(places["University of Ibadan"], places["Ring Road"], [places["Bodija Market"], places.Dugbe], true),
};
console.log(JSON.stringify(results, null, 2));
