import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261117110426_guest_assisted_booking.sql", "utf8");
const terminalGuardMigration = readFileSync("supabase/migrations/20261117123704_guest_terminal_payment_guard.sql", "utf8");
const acceptRoute = readFileSync("src/app/api/assisted/quotes/[token]/accept/route.ts", "utf8");
const verifyRoute = readFileSync("src/app/api/assisted/quotes/[token]/verify/route.ts", "utf8");
const review = readFileSync("src/components/assisted/quote-review.tsx", "utf8");
const guestPage = readFileSync("src/app/guest/orders/[token]/page.tsx", "utf8");
const guestPayment = readFileSync("src/app/api/payments/guest/route.ts", "utf8");
const receiverLink = readFileSync("src/app/api/guest/orders/[token]/receiver-link/route.ts", "utf8");
const surchargeResponse = readFileSync("src/app/api/guest/orders/[token]/surcharges/[id]/route.ts", "utf8");
const surchargePayment = readFileSync("src/app/api/payments/guest/supplemental/route.ts", "utf8");

describe("guest assisted booking", () => {
  it("creates guest orders atomically without weakening customer order authorization", () => {
    expect(migration).toContain("create or replace function public.accept_assisted_guest_quote");
    expect(migration).toContain("customer_id,quote_id");
    expect(migration).toContain("null,selected_quote.id");
    expect(migration).toContain("delivery_orders_assisted_draft_once_idx");
    expect(migration).toContain("guest_order.created");
    expect(migration).not.toContain("create or replace function public.create_delivery_order");
  });

  it("keeps guest tokens hashed and inaccessible to browser database roles", () => {
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.guest_order_access_tokens from public,anon,authenticated");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toContain("to service_role");
  });

  it("accepts a verified assisted quote without requiring a login", () => {
    expect(acceptRoute).toContain('admin.rpc("accept_assisted_guest_quote"');
    expect(acceptRoute).toContain("guest_access_token_hash");
    expect(acceptRoute).toContain("takeRateLimit");
    expect(acceptRoute).not.toContain("getAuthenticatedRole");
    expect(verifyRoute).toContain("takeRateLimit");
  });

  it("uses a simple two-step mobile-first customer flow", () => {
    expect(review).toContain("You do not need an account or password.");
    expect(review).toContain("Who will pay for this delivery?");
    expect(review).toContain("min-h-12");
    expect(review).toContain("dovid-receiver-token-");
    expect(guestPage).toContain('robots: { index: false, follow: false, nocache: true }');
    expect(guestPage).toContain("No account is needed.");
  });

  it("preserves sender and receiver hosted payment paths", () => {
    expect(guestPayment).toContain("getOrCreateMainPaymentIntent");
    expect(guestPayment).toContain('payment_type: "guest_sender"');
    expect(guestPayment).toContain("initializePaystackPayment");
    expect(receiverLink).toContain('admin.rpc("issue_guest_receiver_payment_token"');
    expect(receiverLink).toContain("hashAssistedSecret(receiverToken)");
    expect(migration).toContain("guest.receiver_payment_link_rotated");
  });

  it("supports separately approved guest supplemental charges", () => {
    expect(migration).toContain("create or replace function public.respond_to_guest_surcharge");
    expect(migration).toContain("guest.surcharge_");
    expect(surchargeResponse).toContain('admin.rpc("respond_to_guest_surcharge"');
    expect(surchargePayment).toContain('payment_type: "guest_supplemental"');
    expect(surchargePayment).toContain("approved_amount_kobo");
  });

  it("blocks new payment activity after a delivery is terminal", () => {
    expect(terminalGuardMigration).toContain("payment_intents_terminal_order_guard");
    expect(terminalGuardMigration).toContain("receiver_payment_tokens_terminal_order_guard");
    expect(terminalGuardMigration).toContain("customer_surcharges_terminal_order_guard");
    expect(guestPayment).toContain('["cancelled", "delivered"].includes(order.delivery_status)');
    expect(surchargePayment).toContain('["cancelled", "delivered"].includes(order.delivery_status)');
    expect(guestPage).toContain("This delivery is closed. No payment can be started.");
  });
});
