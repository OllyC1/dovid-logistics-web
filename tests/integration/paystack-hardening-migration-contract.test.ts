import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202611140009_paystack_test_mode_hardening.sql", "utf8");

describe("Paystack hardening migration", () => {
  it("enforces main-intent and reconciliation idempotency", () => {
    expect(sql).toContain("payment_intents_active_main_order_idx");
    expect(sql).toContain("payment_reconciliations_external_reference_idx");
  });
  it("records refunds and disputes behind deny-all client RLS", () => {
    expect(sql).toContain("create table public.payment_refunds");
    expect(sql).toContain("create table public.payment_disputes");
    expect(sql).toContain("payment_refunds_client_deny");
    expect(sql).toContain("payment_disputes_client_deny");
  });
  it("requires verified main and mandatory supplemental payments before handover", () => {
    expect(sql).toContain("order_has_verified_payment_clearance");
    expect(sql).toContain("mandatory_for_handover");
    expect(sql).toContain("payment clearance required");
  });
});
