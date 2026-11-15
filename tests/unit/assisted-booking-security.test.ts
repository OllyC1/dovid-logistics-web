import { describe, expect, it } from "vitest";
import { createAssistedAccessSecrets, hashAssistedSecret } from "@/features/assisted-bookings/security";

describe("assisted quote link security", () => {
  it("creates high-entropy tokens and separate six-digit OTP hashes", () => {
    const first = createAssistedAccessSecrets();
    const second = createAssistedAccessSecrets();
    expect(first.token.length).toBeGreaterThanOrEqual(40);
    expect(first.otp).toMatch(/^\d{6}$/);
    expect(first.tokenHash).not.toBe(hashAssistedSecret(first.otp));
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });
});

