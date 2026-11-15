import { afterEach, describe, expect, it } from "vitest";
import { assertPaystackKeyIsAllowed, assistedBookingsEnabled, livePaymentsEnabled, publicBookingsEnabled } from "@/lib/launch-controls";

const originalPublicBookings = process.env.ENABLE_PUBLIC_BOOKINGS;
const originalLivePayments = process.env.ENABLE_LIVE_PAYMENTS;
const originalAssistedBookings = process.env.ENABLE_ASSISTED_BOOKINGS;

afterEach(() => {
  if (originalPublicBookings === undefined) delete process.env.ENABLE_PUBLIC_BOOKINGS;
  else process.env.ENABLE_PUBLIC_BOOKINGS = originalPublicBookings;
  if (originalLivePayments === undefined) delete process.env.ENABLE_LIVE_PAYMENTS;
  else process.env.ENABLE_LIVE_PAYMENTS = originalLivePayments;
  if (originalAssistedBookings === undefined) delete process.env.ENABLE_ASSISTED_BOOKINGS;
  else process.env.ENABLE_ASSISTED_BOOKINGS = originalAssistedBookings;
});

describe("launch controls", () => {
  it("keeps public, assisted and live payment launches off by default", () => {
    delete process.env.ENABLE_PUBLIC_BOOKINGS;
    delete process.env.ENABLE_LIVE_PAYMENTS;
    delete process.env.ENABLE_ASSISTED_BOOKINGS;
    expect(publicBookingsEnabled()).toBe(false);
    expect(livePaymentsEnabled()).toBe(false);
    expect(assistedBookingsEnabled()).toBe(false);
  });

  it("allows test keys while live payments are disabled", () => {
    delete process.env.ENABLE_LIVE_PAYMENTS;
    expect(() => assertPaystackKeyIsAllowed("sk_test_example")).not.toThrow();
  });

  it("rejects live Paystack keys unless explicitly enabled", () => {
    delete process.env.ENABLE_LIVE_PAYMENTS;
    expect(() => assertPaystackKeyIsAllowed("sk_live_example")).toThrow("A Paystack test secret key is required");
    expect(() => assertPaystackKeyIsAllowed("not-a-paystack-key")).toThrow("A Paystack test secret key is required");
  });
});
