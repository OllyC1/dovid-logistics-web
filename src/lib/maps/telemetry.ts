type GoogleMapsOperation = "places_autocomplete" | "place_details" | "compute_route" | "optimize_route";

export async function googleMapsRequest(operation: GoogleMapsOperation, url: string, init: RequestInit) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, init);
    const event = { event: "google_maps_request", operation, status: response.status, ok: response.ok, durationMs: Math.round(performance.now() - startedAt) };
    if (response.ok) console.info(JSON.stringify(event));
    else console.error(JSON.stringify(event));
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: "google_maps_request", operation, status: "network_error", durationMs: Math.round(performance.now() - startedAt), errorType: error instanceof Error ? error.name : "unknown" }));
    throw error;
  }
}
