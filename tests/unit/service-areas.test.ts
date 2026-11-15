import { describe,expect,it } from "vitest";
import { isPointInGeoJson } from "@/features/service-areas/contains";
const zone={type:"Polygon" as const,coordinates:[[[3,7],[4,7],[4,8],[3,8],[3,7]]]};
describe("service area geometry",()=>{it("recognizes a coordinate inside a polygon",()=>{expect(isPointInGeoJson({latitude:7.5,longitude:3.5},zone)).toBe(true)});it("rejects coordinates outside coverage",()=>{expect(isPointInGeoJson({latitude:8.5,longitude:3.5},zone)).toBe(false)})});
