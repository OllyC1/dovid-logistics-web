import { describe, expect, it } from "vitest";
import { classifyCheckoutSession, paymentCheckoutErrorStatus, PaymentCheckoutInProgressError } from "@/features/payments/checkout";

const now = Date.parse("2026-11-18T12:00:00.000Z");

describe("Paystack checkout session classification", () => {
  it("reuses only an unexpired Paystack hosted checkout URL", () => {
    expect(classifyCheckoutSession({
      status: "ready",
      authorization_url: "https://checkout.paystack.com/test-access-code",
      expires_at: "2026-11-18T12:30:00.000Z",
      updated_at: "2026-11-18T11:59:50.000Z",
    }, "2026-11-18T11:59:40.000Z", now)).toBe("ready");

    expect(classifyCheckoutSession({
      status: "ready",
      authorization_url: "https://example.com/not-paystack",
      expires_at: "2026-11-18T12:30:00.000Z",
      updated_at: "2026-11-18T11:59:50.000Z",
    }, "2026-11-18T11:59:40.000Z", now)).toBe("stale");
  });

  it("protects a recent initialization from concurrent retries", () => {
    expect(classifyCheckoutSession({
      status: "initializing",
      authorization_url: null,
      expires_at: "2026-11-18T12:30:00.000Z",
      updated_at: "2026-11-18T11:59:30.001Z",
    }, "2026-11-18T11:59:20.000Z", now)).toBe("initializing");
    expect(paymentCheckoutErrorStatus(new PaymentCheckoutInProgressError())).toBe(409);
  });

  it("allows an abandoned initialization to be retired after the grace period", () => {
    expect(classifyCheckoutSession(null, "2026-11-18T11:58:59.999Z", now)).toBe("stale");
    expect(classifyCheckoutSession({
      status: "failed",
      authorization_url: null,
      expires_at: "2026-11-18T12:30:00.000Z",
      updated_at: "2026-11-18T11:59:59.000Z",
    }, "2026-11-18T11:59:58.000Z", now)).toBe("stale");
  });
});
