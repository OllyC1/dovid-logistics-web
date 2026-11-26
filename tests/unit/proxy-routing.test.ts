import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "../../src/proxy";

function matches(pathname: string) {
  return unstable_doesMiddlewareMatch({
    config,
    nextConfig: {},
    url: `https://dovidlogistics.com${pathname}`,
  });
}

describe("Supabase session refresh routing", () => {
  it.each([
    "/",
    "/services",
    "/book",
    "/track/TRK-CONTROLLED",
    "/guest/orders/controlled-token",
    "/api/maps/places?input=bodija",
    "/api/delivery/quotes",
    "/api/payments/webhook",
    "/api/payments/receiver",
    "/api/guest/orders/token/receiver-link",
    "/api/inquiries",
  ])("keeps the session-free route %s outside the auth proxy", (pathname) => {
    expect(matches(pathname)).toBe(false);
  });

  it.each([
    "/account",
    "/account/orders",
    "/admin/team",
    "/rider/orders/controlled-order",
    "/staff/setup",
    "/reset-password",
    "/api/admin/dispatch/fleet",
    "/api/customer/surcharges/controlled-charge",
    "/api/rider/orders/controlled-order/status",
    "/api/staff/onboarding/complete",
    "/api/orders",
    "/api/payments/initialize",
    "/api/payments/supplemental",
    "/api/delivery/quotes/controlled-quote",
    "/api/delivery/quotes/controlled-quote/confirm",
  ])("keeps the authenticated route %s behind session refresh", (pathname) => {
    expect(matches(pathname)).toBe(true);
  });
});
