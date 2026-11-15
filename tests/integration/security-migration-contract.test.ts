import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202611140003_security_hardening.sql", "utf8");

describe("security hardening migration contract", () => {
  it("enables RLS on every previously exposed table", () => {
    for (const table of ["service_areas", "service_zones", "pricing_rules", "payment_events", "verified_payment_accounts", "receiver_payment_tokens", "audit_logs", "business_enquiries"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("prevents customer role and payment-intent mutation", () => {
    expect(sql).toContain("revoke insert, update, delete on public.profiles from anon, authenticated");
    expect(sql).toContain("grant update (full_name, phone, default_currency, updated_at)");
    expect(sql).toContain("revoke insert, update, delete on public.payment_intents from anon, authenticated");
  });

  it("binds and single-uses a confirmed quote", () => {
    expect(sql).toContain("set search_path=public,extensions");
    expect(sql).toContain("delivery_orders_quote_once_idx");
    expect(sql).toContain("pickupCoordinates");
    expect(sql).toContain("declaredValueMinor");
    expect(sql).toContain("confirmed quote has already been used");
  });

  it("keeps settlement and delivery transitions server-only", () => {
    expect(sql).toContain("revoke all on function public.record_verified_payment(uuid,text,jsonb)");
    expect(sql).toContain("revoke all on function public.transition_delivery_order(uuid,public.delivery_status,jsonb)");
  });
});
