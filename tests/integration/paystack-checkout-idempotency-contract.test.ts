import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202611180002_paystack_checkout_idempotency.sql", "utf8");
const checkout = readFileSync("src/features/payments/checkout.ts", "utf8");
const routeFiles = [
  "src/app/api/payments/initialize/route.ts",
  "src/app/api/payments/guest/route.ts",
  "src/app/api/payments/receiver/route.ts",
  "src/app/api/payments/supplemental/route.ts",
  "src/app/api/payments/guest/supplemental/route.ts",
];

describe("Paystack hosted checkout idempotency", () => {
  it("stores hosted checkout URLs in a server-only RLS table", () => {
    expect(migration).toContain("create table public.payment_checkout_sessions");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("payment_checkout_sessions_client_deny");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toContain("to service_role");
  });

  it("allows a failed or expired attempt to use a fresh idempotency key record", () => {
    expect(migration).toContain("drop index if exists public.payment_intents_idempotency_idx");
    expect(migration).toContain("status in ('pending','processing','paid','partially_refunded','refunded')");
  });

  it("protects all hosted checkout entry points from duplicate provider initialization", () => {
    for (const path of routeFiles) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("getOrInitializePaymentCheckout");
      expect(source, path).toContain("paymentCheckoutErrorStatus");
    }
    expect(checkout).toContain('hostname === "checkout.paystack.com"');
    expect(checkout).toContain("Payment setup is still finishing");
    expect(checkout).toContain("authorization_url: session!.authorization_url!");
    expect(checkout).toContain("markPaymentInitializationFailed(admin, intent.id)");
  });

  it("allows approved supplemental checkouts to resume after entering payment pending", () => {
    for (const path of [
      "src/app/api/payments/supplemental/route.ts",
      "src/app/api/payments/guest/supplemental/route.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain('["customer_approved", "payment_pending"].includes(surcharge.status)');
    }
  });
});
