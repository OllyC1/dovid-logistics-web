import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261125213500_reject_placeholder_fleet_registration.sql", "utf8");
const assignmentRoute = readFileSync("src/app/api/admin/dispatch/assign/route.ts", "utf8");
const runRoute = readFileSync("src/app/api/admin/runs/route.ts", "utf8");
const publicQuoteRoute = readFileSync("src/app/api/delivery/quotes/route.ts", "utf8");
const assistedQuote = readFileSync("src/features/assisted-bookings/create-quote.ts", "utf8");
const dispatchReadiness = readFileSync("src/features/dispatch/readiness.ts", "utf8");
const optionalMetadataMigration = readFileSync("supabase/migrations/20261126204919_make_fleet_metadata_and_rest_rules_optional.sql", "utf8");

describe("placeholder fleet registration quarantine", () => {
  it("takes uncommitted placeholder motorcycles offline and records the change", () => {
    expect(migration).toContain("resolve active work before taking a placeholder motorcycle offline");
    expect(migration).toContain("operational_status='offline'");
    expect(migration).toContain("assigned_rider_id=null");
    expect(migration).toContain("fleet.placeholder_registration_quarantined");
  });

  it("keeps the historical placeholder quarantine auditable", () => {
    expect(migration).toContain("fleet_vehicles_placeholder_not_dispatchable");
  });

  it("uses safety, measured capacity and rider assignment instead of optional registration metadata", () => {
    expect(publicQuoteRoute).toContain("calculateDispatchCapacity");
    expect(assistedQuote).toContain("calculateDispatchCapacity");
    expect(dispatchReadiness).not.toContain("hasVerifiedVehicleRegistration(vehicle)");
    expect(assignmentRoute).not.toContain("hasVerifiedVehicleRegistration(vehicle)");
    expect(runRoute).not.toContain("hasVerifiedVehicleRegistration(vehicle)");
    expect(optionalMetadataMigration).toContain("fleet.optional_metadata_readiness_restored");
    expect(optionalMetadataMigration).toContain("vehicle_record.capacity_verified_at is null");
  });
});
