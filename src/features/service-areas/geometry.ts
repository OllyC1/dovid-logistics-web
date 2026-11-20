import type { Coordinates } from "@/types/domain";

export type PolygonCoordinates = number[][][];
export type MultiPolygonCoordinates = PolygonCoordinates[];
export type ZoneGeometry = { type: "Polygon"; coordinates: PolygonCoordinates } | { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates };
export type ZoneGeoJson = ZoneGeometry | { type: "Feature"; properties?: Record<string, unknown>; geometry: ZoneGeometry };

function asGeometry(input: ZoneGeoJson): ZoneGeometry {
  return input.type === "Feature" ? input.geometry : input;
}

function pointEquals(left: number[], right: number[]) {
  return left[0] === right[0] && left[1] === right[1];
}

function orientation(a: number[], b: number[], c: number[]) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: number[], b: number[], c: number[]) {
  return b[0] <= Math.max(a[0], c[0]) && b[0] >= Math.min(a[0], c[0]) && b[1] <= Math.max(a[1], c[1]) && b[1] >= Math.min(a[1], c[1]);
}

function segmentsIntersect(a: number[], b: number[], c: number[], d: number[]) {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (first !== second && third !== fourth) return true;
  return (first === 0 && onSegment(a, c, b)) || (second === 0 && onSegment(a, d, b)) || (third === 0 && onSegment(c, a, d)) || (fourth === 0 && onSegment(c, b, d));
}

function segmentsProperlyIntersect(a: number[], b: number[], c: number[], d: number[]) {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return first !== 0 && second !== 0 && third !== 0 && fourth !== 0 && first !== second && third !== fourth;
}

function ringArea(ring: number[][]) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  return Math.abs(area / 2);
}

function ringSelfIntersects(ring: number[][]) {
  for (let first = 0; first < ring.length - 1; first += 1) {
    for (let second = first + 1; second < ring.length - 1; second += 1) {
      if (Math.abs(first - second) <= 1 || (first === 0 && second === ring.length - 2)) continue;
      if (segmentsIntersect(ring[first], ring[first + 1], ring[second], ring[second + 1])) return true;
    }
  }
  return false;
}

export function validateZoneGeoJson(input: unknown) {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return { valid: false, issues: ["A GeoJSON Polygon or MultiPolygon is required."] };
  const candidate = input as Partial<ZoneGeoJson> & { geometry?: Partial<ZoneGeometry> };
  const geometry = candidate.type === "Feature" ? candidate.geometry : candidate;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") || !Array.isArray(geometry.coordinates)) {
    return { valid: false, issues: ["Only GeoJSON Polygon and MultiPolygon boundaries are supported."] };
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates as PolygonCoordinates] : geometry.coordinates as MultiPolygonCoordinates;
  if (!polygons.length) issues.push("The boundary must contain at least one polygon.");
  polygons.forEach((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || !polygon.length) issues.push(`Polygon ${polygonIndex + 1} has no exterior ring.`);
    polygon?.forEach((ring, ringIndex) => {
      if (!Array.isArray(ring) || ring.length < 4) { issues.push(`Polygon ${polygonIndex + 1}, ring ${ringIndex + 1} needs at least four positions.`); return; }
      for (const position of ring) {
        if (!Array.isArray(position) || position.length < 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) issues.push("Every boundary position must contain numeric longitude and latitude values.");
        else if (position[0] < -180 || position[0] > 180 || position[1] < -90 || position[1] > 90) issues.push("Boundary coordinates are outside valid longitude or latitude ranges.");
      }
      if (!pointEquals(ring[0], ring[ring.length - 1])) issues.push(`Polygon ${polygonIndex + 1}, ring ${ringIndex + 1} is not closed.`);
      if (ringArea(ring) < 1e-10) issues.push(`Polygon ${polygonIndex + 1}, ring ${ringIndex + 1} has no usable area.`);
      if (ringSelfIntersects(ring)) issues.push(`Polygon ${polygonIndex + 1}, ring ${ringIndex + 1} crosses itself.`);
    });
  });
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function inRing(point: Coordinates, ring: number[][]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const intersects = (currentLatitude > point.latitude) !== (previousLatitude > point.latitude)
      && point.longitude < ((previousLongitude - currentLongitude) * (point.latitude - currentLatitude)) / (previousLatitude - currentLatitude) + currentLongitude;
    if (intersects) inside = !inside;
  }
  return inside;
}

function inPolygon(point: Coordinates, polygon: PolygonCoordinates) {
  if (!polygon[0] || !inRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((ring) => inRing(point, ring));
}

function isPointOnRing(point: Coordinates, ring: number[][]) {
  const position = [point.longitude, point.latitude];
  return ring.some((current, index) => index < ring.length - 1 && orientation(current, ring[index + 1], position) === 0 && onSegment(current, position, ring[index + 1]));
}

function isPointStrictlyInPolygon(point: Coordinates, polygon: PolygonCoordinates) {
  if (!polygon[0] || isPointOnRing(point, polygon[0]) || !inRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((ring) => isPointOnRing(point, ring) || inRing(point, ring));
}

function isPointStrictlyInZone(point: Coordinates, input: ZoneGeoJson) {
  const geometry = asGeometry(input);
  if (geometry.type === "Polygon") return isPointStrictlyInPolygon(point, geometry.coordinates);
  return geometry.coordinates.some((polygon) => isPointStrictlyInPolygon(point, polygon));
}

export function isPointInZoneGeoJson(point: Coordinates, input: ZoneGeoJson) {
  const geometry = asGeometry(input);
  if (geometry.type === "Polygon") return inPolygon(point, geometry.coordinates);
  return geometry.coordinates.some((polygon) => inPolygon(point, polygon));
}

function exteriorRings(input: ZoneGeoJson) {
  const geometry = asGeometry(input);
  return geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((polygon) => polygon[0]);
}

export function zoneBoundariesOverlap(left: ZoneGeoJson, right: ZoneGeoJson) {
  const leftRings = exteriorRings(left);
  const rightRings = exteriorRings(right);
  for (const leftRing of leftRings) for (const rightRing of rightRings) {
    for (let leftIndex = 0; leftIndex < leftRing.length - 1; leftIndex += 1) {
      for (let rightIndex = 0; rightIndex < rightRing.length - 1; rightIndex += 1) {
        if (segmentsProperlyIntersect(leftRing[leftIndex], leftRing[leftIndex + 1], rightRing[rightIndex], rightRing[rightIndex + 1])) return true;
      }
    }
    for (let index = 0; index < leftRing.length - 1; index += 1) {
      const current = leftRing[index];
      const next = leftRing[index + 1];
      const vertex = { longitude: current[0], latitude: current[1] };
      const midpoint = { longitude: (current[0] + next[0]) / 2, latitude: (current[1] + next[1]) / 2 };
      if (isPointStrictlyInZone(vertex, right) || isPointStrictlyInZone(midpoint, right)) return true;
    }
    for (let index = 0; index < rightRing.length - 1; index += 1) {
      const current = rightRing[index];
      const next = rightRing[index + 1];
      const vertex = { longitude: current[0], latitude: current[1] };
      const midpoint = { longitude: (current[0] + next[0]) / 2, latitude: (current[1] + next[1]) / 2 };
      if (isPointStrictlyInZone(vertex, left) || isPointStrictlyInZone(midpoint, left)) return true;
    }
  }
  return false;
}
