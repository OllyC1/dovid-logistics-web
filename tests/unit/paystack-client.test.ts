import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializePaystackPayment, verifyPaystackTransaction, verifyPaystackWebhookSignature } from "@/lib/paystack/client";

const originalSecret = process.env.PAYSTACK_SECRET_KEY;
const originalWebhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = originalSecret;
  if (originalWebhookSecret === undefined) delete process.env.PAYSTACK_WEBHOOK_SECRET; else process.env.PAYSTACK_WEBHOOK_SECRET = originalWebhookSecret;
  delete process.env.PAYSTACK_WEBHOOK_SECRET_PREVIOUS;
  delete process.env.ENABLE_LIVE_PAYMENTS;
});

describe("Paystack client", () => {
  it("verifies the current timestamped webhook signature", () => {
    process.env.PAYSTACK_WEBHOOK_SECRET = "whsec_test_signing_secret";
    const body = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    const timestamp = 1_800_000_000;
    const signature = createHmac("sha512", process.env.PAYSTACK_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex");
    expect(verifyPaystackWebhookSignature(body, { paystackSignature: `t=${timestamp},v1=whk_test:${signature}`, legacySignature: null }, timestamp)).toBe(true);
    expect(verifyPaystackWebhookSignature(body, { paystackSignature: `t=${timestamp - 301},v1=whk_test:${signature}`, legacySignature: null }, timestamp)).toBe(false);
  });

  it("supports the legacy secret-key signature during migration", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_example";
    const body = "{\"event\":\"ping\"}";
    const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
    expect(verifyPaystackWebhookSignature(body, { paystackSignature: null, legacySignature: signature })).toBe(true);
    expect(verifyPaystackWebhookSignature(body, { paystackSignature: null, legacySignature: "not-hex" })).toBe(false);
  });

  it("initializes only a matching Paystack checkout URL and reference", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_example";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/test-code", access_code: "test-code", reference: "DOV-TEST-1" } }), { status: 200 })));
    await expect(initializePaystackPayment({ email: "sender@example.com", amountMinor: 250000, reference: "DOV-TEST-1", callbackUrl: "https://staging.example.com/pay/callback", metadata: {} })).resolves.toMatchObject({ reference: "DOV-TEST-1" });
  });

  it("rejects live verification responses while live payments are disabled", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_example";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, data: { id: 1, domain: "live", status: "success", reference: "DOV-TEST-1", amount: 250000, currency: "NGN" } }), { status: 200 })));
    await expect(verifyPaystackTransaction("DOV-TEST-1")).rejects.toThrow("Live Paystack payments are disabled");
  });
});
