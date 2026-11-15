import type { Coordinates } from "@/types/domain";
import { isPointInZoneGeoJson, type ZoneGeoJson } from "@/features/service-areas/geometry";

export function isPointInGeoJson(point: Coordinates, input: ZoneGeoJson) {
  return isPointInZoneGeoJson(point, input);
}
