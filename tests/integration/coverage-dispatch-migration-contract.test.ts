import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202611140005_ibadan_coverage_dispatch.sql", "utf8");

describe("Ibadan coverage and dispatch migration", () => {
  it("seeds six stable inactive planning zones without fabricated geometry", () => {
    expect(sql.match(/'draft','unavailable'/g)).toHaveLength(6);
    expect(sql.match(/null,false,'draft'/g)).toHaveLength(6);
    expect(sql).toContain("Zone F — Outskirts");
  });
  it("adds an overlapping whole-Ibadan fallback without treating adjacent edges as overlap", () => {
    const citywide = readFileSync("supabase/migrations/20261120220000_ibadan_citywide_fallback_zone.sql", "utf8");
    expect(citywide).toContain("is_citywide");
    expect(citywide).toContain("'Ibadan'");
    expect(citywide).toContain("'manual_approval'");
    expect(citywide).toContain("100");
    expect(readFileSync("supabase/migrations/20261120221500_enforce_outskirts_manual_approval.sql", "utf8")).toContain("dispatch_approval_required=true");
  });
  it("creates resumable request references and alerts dispatch managers", () => {
    const requests = readFileSync("supabase/migrations/20261120224500_resumable_availability_requests.sql", "utf8");
    expect(requests).toContain("reference_code");
    expect(requests).toContain("notify_dispatch_of_availability_request");
    expect(requests).toContain("dispatch.approval_requested");
    expect(requests).toContain("actionPath','/admin/dispatch");
  });
  it("provides an atomic Super Admin save-and-publish path", () => {
    const publish = readFileSync("supabase/migrations/20261121071500_publish_service_zone.sql", "utf8");
    expect(publish).toContain("publish_service_zone");
    expect(publish).toContain("membership.staff_role='super_admin'");
    expect(publish).toContain("service_zone.published");
  });
  it("requires review, approval and unchanged geometry before activation", () => {
    expect(sql).toContain("zone must be in review before approval");
    expect(sql).toContain("explicit zone approval required");
    expect(sql).toContain("zone boundary changed after approval");
  });
  it("configures two offline motorcycles with preference territories", () => {
    expect(sql).toContain("IB-BIKE-01");
    expect(sql).toContain("IB-BIKE-02");
    expect(sql).toContain("array['A','B']");
    expect(sql).toContain("array['C','D']");
  });
  it("keeps mutation and dispatch functions service-role only", () => {
    expect(sql).toContain("revoke insert,update,delete on public.service_zones");
    expect(sql).toContain("grant execute on function public.assign_delivery_order");
    expect(sql).toContain("to service_role");
  });
});
