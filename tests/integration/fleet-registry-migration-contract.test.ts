import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261117144443_fleet_registry_and_readiness.sql", "utf8");
const createRoute = readFileSync("src/app/api/admin/dispatch/fleet/route.ts", "utf8");
const updateRoute = readFileSync("src/app/api/admin/dispatch/fleet/[id]/route.ts", "utf8");
const verificationSql = readFileSync("supabase/migrations/20261126180626_verify_fleet_registrations.sql", "utf8");

describe("fleet registry and readiness hardening", () => {
  it("makes normalized plate numbers unique without inventing plates for seeded bikes", () => {
    expect(sql).toContain("registration_number text");
    expect(sql).toContain("fleet_vehicles_registration_number_unique_idx");
    expect(sql).toContain("new.registration_number := upper");
    expect(sql).not.toMatch(/update public\.fleet_vehicles[\s\S]+registration_number\s*=/i);
  });

  it("prevents an unready bike or unverified rider from becoming available", () => {
    expect(sql).toContain("record the motorcycle plate number before activation");
    expect(sql).toContain("assign an active rider before activation");
    expect(sql).toContain("complete the motorcycle safety review before activation");
    expect(sql).toContain("record and verify motorcycle capacity before activation");
    expect(sql).toContain("membership.status='active'");
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

  it("separates entered plate text from reviewed physical registration evidence", () => {
    expect(verificationSql).toContain("registration_verified_at timestamptz");
    expect(verificationSql).toContain("registration_verification_method text");
    expect(verificationSql).toContain("registration_verification_reference text");
    expect(verificationSql).toContain("verify the physical motorcycle registration before activation");
    expect(verificationSql).toContain("registration-verified, safety-cleared bike");
    expect(verificationSql).toContain("set operational_status='offline'");
    expect(updateRoute).toContain("registrationVerificationMethod");
    expect(updateRoute).toContain("registrationVerificationReference");
    expect(updateRoute).toContain("registrationChanged");
  });
});
