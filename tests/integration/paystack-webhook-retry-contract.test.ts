import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook = readFileSync("src/app/api/payments/webhook/route.ts", "utf8");

describe("Paystack webhook retry safety", () => {
  it("reconciles an authenticated duplicate instead of returning before idempotent processing", () => {
    expect(webhook).toContain('const duplicate = eventError?.code === "23505"');
    expect(webhook).not.toContain('if (eventError?.code === "23505") return');
    expect(webhook).toContain("paymentIntentReference(event)");
    expect(webhook).toContain("duplicate ? { duplicate: true } : {}");
  });
});
