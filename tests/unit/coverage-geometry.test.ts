import { describe, expect, it } from "vitest";
import { isPointInZoneGeoJson, validateZoneGeoJson, zoneBoundariesOverlap, type ZoneGeoJson } from "@/features/service-areas/geometry";

const square = (minimumLongitude: number, minimumLatitude: number, maximumLongitude: number, maximumLatitude: number): ZoneGeoJson => ({ type: "Polygon", coordinates: [[[minimumLongitude, minimumLatitude], [maximumLongitude, minimumLatitude], [maximumLongitude, maximumLatitude], [minimumLongitude, maximumLatitude], [minimumLongitude, minimumLatitude]]] });

describe("coverage geometry", () => {
  it("accepts a closed non-self-intersecting polygon", () => expect(validateZoneGeoJson(square(3.8, 7.2, 4, 7.4))).toEqual({ valid: true, issues: [] }));
  it("rejects open and self-intersecting polygons", () => {
    expect(validateZoneGeoJson({ type: "Polygon", coordinates: [[[3.8, 7.2], [4, 7.4], [3.8, 7.4], [4, 7.2], [3.8, 7.2]]] }).valid).toBe(false);
    expect(validateZoneGeoJson({ type: "Polygon", coordinates: [[[3.8, 7.2], [4, 7.2], [4, 7.4], [3.8, 7.4]]] }).valid).toBe(false);
  });
  it("detects overlap and containment", () => {
    expect(zoneBoundariesOverlap(square(3.8, 7.2, 4, 7.4), square(3.9, 7.3, 4.1, 7.5))).toBe(true);
    expect(zoneBoundariesOverlap(square(3.8, 7.2, 4.2, 7.6), square(3.9, 7.3, 4, 7.4))).toBe(true);
    expect(zoneBoundariesOverlap(square(3.8, 7.2, 4, 7.4), square(4.1, 7.5, 4.2, 7.6))).toBe(false);
    expect(zoneBoundariesOverlap(square(3.8, 7.2, 4, 7.4), square(4, 7.2, 4.2, 7.4))).toBe(false);
  });
  it("handles edge-adjacent geographic points consistently", () => {
    const polygon = square(3.8, 7.2, 4, 7.4);
    expect(isPointInZoneGeoJson({ longitude: 3.9, latitude: 7.3 }, polygon)).toBe(true);
    expect(isPointInZoneGeoJson({ longitude: 4.1, latitude: 7.3 }, polygon)).toBe(false);
  });
});
