import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261117144443_fleet_registry_and_readiness.sql", "utf8");
const createRoute = readFileSync("src/app/api/admin/dispatch/fleet/route.ts", "utf8");
const updateRoute = readFileSync("src/app/api/admin/dispatch/fleet/[id]/route.ts", "utf8");
const verificationSql = readFileSync("supabase/migrations/20261126180626_verify_fleet_registrations.sql", "utf8");
const optionalMetadataSql = readFileSync("supabase/migrations/20261126204919_make_fleet_metadata_and_rest_rules_optional.sql", "utf8");

describe("fleet registry and readiness hardening", () => {
  it("makes normalized plate numbers unique without inventing plates for seeded bikes", () => {
    expect(sql).toContain("registration_number text");
    expect(sql).toContain("fleet_vehicles_registration_number_unique_idx");
    expect(sql).toContain("new.registration_number := upper");
    expect(sql).not.toMatch(/update public\.fleet_vehicles[\s\S]+registration_number\s*=/i);
  });

  it("requires active rider, safety and measured capacity while leaving metadata optional", () => {
    expect(optionalMetadataSql).toContain("assign an active rider before activation");
    expect(optionalMetadataSql).toContain("complete the motorcycle safety review before activation");
    expect(optionalMetadataSql).toContain("record and verify motorcycle capacity before activation");
    expect(optionalMetadataSql).toContain("membership.status='active'");
    expect(optionalMetadataSql).not.toContain("verify the physical motorcycle registration before activation");
  });

  it("keeps fleet changes permission checked and audited", () => {
    expect(createRoute).toContain("getDispatchManagerAuthorization");
    expect(createRoute).toContain('action: "fleet.vehicle.created"');
    expect(createRoute).toContain('operational_status: "offline"');
    expect(createRoute).toContain('safety_status: "review_required"');
    expect(updateRoute).toContain("getDispatchManagerAuthorization");
    expect(updateRoute).toContain('rpc("update_fleet_vehicle_configuration"');
    expect(verificationSql).toContain("'fleet.vehicle.updated'");
    expect(verificationSql).toContain("motorcycle has active delivery work");
    expect(verificationSql).toContain("to service_role");
    expect(updateRoute).toContain('in("status", ["planned", "active", "paused"])');
  });

  it("retains optional registration records without using them as dispatch gates", () => {
    expect(verificationSql).toContain("registration_verified_at timestamptz");
    expect(verificationSql).toContain("registration_verification_method text");
    expect(verificationSql).toContain("registration_verification_reference text");
    expect(optionalMetadataSql).toContain("registration_verified_at is null");
    expect(optionalMetadataSql).toContain("fleet.optional_metadata_readiness_restored");
    expect(optionalMetadataSql).toContain("Plate, description and registration notes are optional");
    expect(updateRoute).toContain("registrationVerificationMethod");
    expect(updateRoute).toContain("registrationVerificationReference");
    expect(updateRoute).toContain("normalizedRegistration");
  });
});
