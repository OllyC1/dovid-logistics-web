import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const formSource = readFileSync("src/components/admin/competitor-evidence-form.tsx", "utf8");
const routeSource = readFileSync("src/app/api/admin/pricing/competitors/quotes/route.ts", "utf8");

describe("mobile competitor evidence workflow", () => {
  it("uses confirmed address suggestions instead of coordinate fields", () => {
    expect(formSource).toContain("<AddressAutocomplete");
    expect(formSource).toContain('label="Pickup address"');
    expect(formSource).toContain('label="Destination address"');
    expect(formSource).not.toContain("Pickup latitude");
    expect(formSource).not.toContain("Pickup longitude");
    expect(formSource).not.toContain("Drop-off latitude");
    expect(formSource).not.toContain("Drop-off longitude");
  });

  it("measures the road route on the trusted server", () => {
    expect(routeSource).toContain('import { getRouteDistance } from "@/lib/maps/routes"');
    expect(routeSource).toContain("await getRouteDistance(input.pickupCoordinates, input.dropoffCoordinates)");
    expect(routeSource).toContain("road_distance_meters: route.distanceMeters");
    expect(formSource).not.toContain('name="roadDistanceKm"');
  });

  it("keeps mobile actions readable and reports a definite result", () => {
    expect(formSource).toContain('className="w-full sm:w-auto"');
    expect(formSource).toContain('role={notice.ok ? "status" : "alert"}');
    expect(formSource).toContain("Route quote saved.");
    expect(routeSource).toContain("no evidence was saved");
  });
});
