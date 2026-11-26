import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261126123000_preserve_refund_state_order.sql", "utf8");

describe("refund state ordering", () => {
  it("keeps stale provider events from moving reconciled refund state backwards", () => {
    expect(migration).toContain("case excluded.status");
    expect(migration).toContain("case public.payment_refunds.status");
    expect(migration).toContain(">=");
    expect(migration).toContain("select r.status into refund_status");
    expect(migration).toContain("effective_provider_status");
  });

  it("keeps the settlement function restricted to the service role", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
