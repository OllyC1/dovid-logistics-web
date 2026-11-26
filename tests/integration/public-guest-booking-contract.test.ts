import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202611180001_public_guest_booking.sql", "utf8");
const hardeningMigration = readFileSync("supabase/migrations/20261121100000_guest_booking_dispatch_hardening.sql", "utf8");
const quoteBindingMigration = readFileSync("supabase/migrations/20261126042631_harden_guest_quote_booking_binding.sql", "utf8");
const notificationEmailMigration = readFileSync("supabase/migrations/20261121103000_explicit_delivery_notification_email.sql", "utf8");
const quoteRoute = readFileSync("src/app/api/delivery/quotes/route.ts", "utf8");
const orderRoute = readFileSync("src/app/api/orders/route.ts", "utf8");
const booking = readFileSync("src/components/booking/booking-wizard.tsx", "utf8");
const guestPage = readFileSync("src/app/guest/orders/[token]/page.tsx", "utf8");
const guestPayment = readFileSync("src/app/api/payments/guest/route.ts", "utf8");
const localAcceptanceRunner = readFileSync("scripts/run-local-supabase-e2e.mjs", "utf8");

describe("direct public guest booking", () => {
  it("keeps launch activation behind the existing server flag", () => {
    expect(quoteRoute).toContain("publicBookingsEnabled()");
    expect(orderRoute).toContain("publicBookingsEnabled()");
    expect(orderRoute).not.toContain("ENABLE_PUBLIC_BOOKINGS = true");
  });

  it("allows real guest acceptance only through the isolated local runner", () => {
    expect(localAcceptanceRunner).toContain('["127.0.0.1", "localhost"].includes(apiUrl.hostname)');
    expect(localAcceptanceRunner).toContain('DOVID_ENABLE_LOCAL_GUEST_BOOKING_E2E === "true"');
    expect(localAcceptanceRunner).toContain('ENABLE_PUBLIC_BOOKINGS: enableLocalGuestBooking ? "true" : "false"');
    expect(localAcceptanceRunner).toContain('RUN_LIVE_GUEST_BOOKING_E2E: enableLocalGuestBooking ? "true" : "false"');
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
    expect(booking).toContain("guestBooking: true");
    expect(booking).toContain("body.guest_order_url");
    expect(guestPage).toContain("No account is needed");
    expect(guestPage).toContain("guest_booking");
  });

  it("keeps payer selection out of repricing but binds the quoted payer at order creation", () => {
    expect(booking).toContain('onChange={set("payer", false)}');
    expect(hardeningMigration).not.toContain("request_payload->>'payer' is distinct");
    expect(quoteBindingMigration).toContain("coalesce(selected_quote.request_payload->>'payer','sender') is distinct from booking_payload->>'payer'");
    expect(guestPayment).toContain("receipt_email");
    expect(hardeningMigration).toContain("selected_order.receipt_email");
  });

  it("prevents token expiry and idempotency weakening in later function replacements", () => {
    expect(quoteBindingMigration).toContain("guest order access expiry is invalid");
    expect(quoteBindingMigration).toContain("selected_token.confirmation_idempotency_key is distinct from booking_idempotency");
    expect(quoteBindingMigration).toContain("quote has already been used");
    expect(quoteBindingMigration).toContain("revoke all on function public.create_guest_delivery_order(jsonb,text,text,timestamptz) from public,anon,authenticated");
    expect(quoteBindingMigration).toContain("grant execute on function public.create_guest_delivery_order(jsonb,text,text,timestamptz) to service_role");
  });

  it("collects an explicit delivery-update email and explains direct rider contact", () => {
    expect(booking).toContain("Email for delivery updates");
    expect(booking).toContain("the rider may need to call the sender or receiver");
    expect(orderRoute).toContain("notification_email");
    expect(notificationEmailMigration).toContain("selected_order.notification_email");
  });

  it("moves new orders into dispatch and notifies the assigned rider", () => {
    expect(hardeningMigration).toContain("advance_new_order_to_dispatch");
    expect(hardeningMigration).toContain("auto_assign_delivery_order");
    expect(hardeningMigration).toContain("'rider_assignment'");
  });

  it("preserves hosted sender, receiver and supplemental payment paths", () => {
    expect(guestPayment).toContain('payment_type: "guest_sender"');
    expect(guestPayment).toContain("returnTo=");
    expect(migration).toContain("issue_guest_receiver_payment_token");
    expect(migration).toContain("respond_to_guest_surcharge");
  });

  it("offers email, call and WhatsApp assistance for manual routes", () => {
    expect(quoteRoute).toContain("manualAssistance");
    expect(quoteRoute).toContain("whatsappUrl");
    expect(booking).toContain("Dispatch is checking this route");
    expect(booking).toContain("Email dispatch");
    expect(booking).toContain("WhatsApp dispatch");
    expect(booking).toContain("Check approval and continue");
    expect(booking).toContain("No order, rider assignment or payment exists yet");
    expect(quoteRoute).toContain("approvalToken");
    expect(quoteRoute).toContain("availability_request_access_tokens");
    expect(quoteRoute).toContain('operational_approval_status: approvedRequest ? "approved" : "not_required"');
    expect(quoteRoute).toContain("reference_code");
  });
});

