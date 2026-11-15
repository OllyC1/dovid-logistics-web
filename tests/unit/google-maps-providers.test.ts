import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlaceDetails, searchPlaces } from "@/lib/maps/places";
import { getRouteDistance, optimizeRunRoute } from "@/lib/maps/routes";

describe("Google Maps providers", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-backend-key";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("biases Places requests without exceeding Google's circle limit", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: "place-1", text: { text: "Dugbe, Ibadan" }, structuredFormat: { mainText: { text: "Dugbe" }, secondaryText: { text: "Ibadan" } } } }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    await searchPlaces("Dugbe", "session-token-123456");
    const init = request.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.locationBias.circle.radius).toBe(50000);
    expect(body.includedRegionCodes).toEqual(["ng"]);
    expect(body.sessionToken).toBe("session-token-123456");
  });

  it("completes the Places billing session with minimal detail fields", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ formattedAddress: "Dugbe, Ibadan", location: { latitude: 7.38, longitude: 3.88 } }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    await getPlaceDetails("place-1", "session-token-123456");
    expect(String(request.mock.calls[0][0])).toContain("sessionToken=session-token-123456");
    expect((request.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "X-Goog-FieldMask": "formattedAddress,location" });
  });

  it("uses provider road distance and never falls back to straight-line distance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider unavailable", { status: 503 })));
    await expect(getRouteDistance({ latitude: 7.4, longitude: 3.9 }, { latitude: 7.3, longitude: 3.8 })).rejects.toThrow("Route provider could not calculate this journey");
  });

  it("restores pickup-before-drop-off after provider optimization", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ routes: [{ distanceMeters: 1000, duration: "300s", optimizedIntermediateWaypointIndex: [0] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ routes: [{ distanceMeters: 1200, duration: "360s", legs: [{ distanceMeters: 500, duration: "150s" }, { distanceMeters: 700, duration: "210s" }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const result = await optimizeRunRoute({ latitude: 7.4, longitude: 3.9 }, [
      { id: "drop", orderId: "order-1", type: "dropoff", latitude: 7.3, longitude: 3.8 },
      { id: "pick", orderId: "order-1", type: "pickup", latitude: 7.35, longitude: 3.85 },
    ]);
    expect(result.stops.map((stop) => stop.type)).toEqual(["pickup", "dropoff"]);
    expect(result.distanceMeters).toBe(1200);
  });
});
