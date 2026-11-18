import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202611180001_public_guest_booking.sql", "utf8");
const quoteRoute = readFileSync("src/app/api/delivery/quotes/route.ts", "utf8");
const orderRoute = readFileSync("src/app/api/orders/route.ts", "utf8");
const booking = readFileSync("src/components/booking/booking-wizard.tsx", "utf8");
const guestPage = readFileSync("src/app/guest/orders/[token]/page.tsx", "utf8");
const guestPayment = readFileSync("src/app/api/payments/guest/route.ts", "utf8");

describe("direct public guest booking", () => {
  it("keeps launch activation behind the existing server flag", () => {
    expect(quoteRoute).toContain("publicBookingsEnabled()");
    expect(orderRoute).toContain("publicBookingsEnabled()");
    expect(orderRoute).not.toContain("ENABLE_PUBLIC_BOOKINGS = true");
  });

  it("issues only hashed, server-held quote and order access tokens", () => {
    expect(migration).toContain("create table public.guest_quote_access_tokens");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("revoke all on public.guest_quote_access_tokens from public,anon,authenticated");
    expect(quoteRoute).toContain("hashAssistedSecret(guestQuoteToken)");
    expect(orderRoute).toContain("hashAssistedSecret(parsed.data.guestQuoteToken)");
    expect(orderRoute).toContain("hashAssistedSecret(guestAccessToken)");
  });

  it("creates a guest order atomically with quote binding and idempotency", () => {
    expect(migration).toContain("create or replace function public.create_guest_delivery_order");
    expect(migration).toContain("booking does not match confirmed quote");
    expect(migration).toContain("delivery_orders_guest_idempotency_idx");
    expect(migration).toContain("guest_order.created");
    expect(migration).toContain("to service_role");
    expect(orderRoute).toContain('admin.rpc("create_guest_delivery_order"');
  });

  it("sends guests to a private delivery page instead of an account page", () => {
    expect(booking).toContain("guestQuoteToken");
    expect(booking).toContain("body.guest_order_url");
    expect(guestPage).toContain("No account is needed.");
    expect(guestPage).toContain("guest_booking");
  });

  it("preserves hosted sender, receiver and supplemental payment paths", () => {
    expect(guestPayment).toContain('payment_type: "guest_sender"');
    expect(guestPayment).toContain("returnTo=");
    expect(migration).toContain("issue_guest_receiver_payment_token");
    expect(migration).toContain("respond_to_guest_surcharge");
  });
});

