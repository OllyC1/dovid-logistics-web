import type { Coordinates } from "@/types/domain";
import { googleMapsRequest } from "@/lib/maps/telemetry";

export async function getRouteDistance(origin: Coordinates, destination: Coordinates, intermediates: Coordinates[] = []) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Routing is not configured");
  const response = await googleMapsRequest("compute_route", "https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration" },
    body: JSON.stringify({ origin: { location: { latLng: origin } }, destination: { location: { latLng: destination } }, intermediates: intermediates.map(latLng => ({ location: { latLng } })), travelMode: "TWO_WHEELER", routingPreference: "TRAFFIC_AWARE" }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Route provider could not calculate this journey");
  const body = await response.json() as { routes?: Array<{ distanceMeters: number; duration: string; legs?: Array<{ distanceMeters: number; duration: string }> }> };
  if (!body.routes?.[0]) throw new Error("No supported route was found");
  return body.routes[0];
}

export type RunRouteStop = Coordinates & { id: string; orderId: string; type: "pickup" | "dropoff"; deadlineAt?: string | null };

function enforcePickupBeforeDropoff(stops: RunRouteStop[]) {
  const result = [...stops];
  for (const dropoff of [...result]) {
    if (dropoff.type !== "dropoff") continue;
    const pickupIndex = result.findIndex((stop) => stop.orderId === dropoff.orderId && stop.type === "pickup");
    const dropoffIndex = result.findIndex((stop) => stop.id === dropoff.id);
    if (pickupIndex > dropoffIndex) {
      const [pickup] = result.splice(pickupIndex, 1);
      result.splice(dropoffIndex, 0, pickup);
    }
  }
  return result;
}

export async function optimizeRunRoute(origin: Coordinates, stops: RunRouteStop[]) {
  if (!stops.length) throw new Error("At least one run stop is required");
  if (stops.length === 1) {
    const route = await getRouteDistance(origin, stops[0]);
    return { ...route, stops, provider: "google_routes", deadlineConflict: false };
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Routing is not configured");
  const destination = stops.at(-1)!;
  const intermediates = stops.slice(0, -1);
  const response = await googleMapsRequest("optimize_route", "https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex" },
    body: JSON.stringify({ origin: { location: { latLng: origin } }, destination: { location: { latLng: destination } }, intermediates: intermediates.map((stop) => ({ location: { latLng: { latitude: stop.latitude, longitude: stop.longitude } } })), travelMode: "TWO_WHEELER", routingPreference: "TRAFFIC_AWARE", optimizeWaypointOrder: true }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Route provider could not optimize this delivery run");
  const body = await response.json() as { routes?: Array<{ distanceMeters: number; duration: string; optimizedIntermediateWaypointIndex?: number[] }> };
  const optimized = body.routes?.[0];
  if (!optimized) throw new Error("No supported delivery-run route was found");
  const orderedIntermediates = (optimized.optimizedIntermediateWaypointIndex ?? intermediates.map((_, index) => index)).map((index) => intermediates[index]);
  const constrainedStops = enforcePickupBeforeDropoff([...orderedIntermediates, destination]);
  const recalculated = await getRouteDistance(origin, constrainedStops.at(-1)!, constrainedStops.slice(0, -1));
  return { ...recalculated, stops: constrainedStops, provider: "google_routes", deadlineConflict: false };
}
