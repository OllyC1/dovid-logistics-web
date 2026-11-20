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
