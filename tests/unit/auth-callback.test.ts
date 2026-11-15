import { describe, expect, it } from "vitest";
import { parseAuthCallbackUrl, safeAuthRedirect } from "@/lib/auth/callback";

describe("auth callback", () => {
  it("recognizes the implicit session returned by an emailed Supabase link", () => {
    expect(parseAuthCallbackUrl("https://dovid.test/auth/complete?next=/staff/setup#access_token=access&refresh_token=refresh&type=magiclink")).toEqual({
      method: "session",
      accessToken: "access",
      refreshToken: "refresh",
      next: "/staff/setup"
    });
  });

  it("supports token-hash email templates", () => {
    expect(parseAuthCallbackUrl("https://dovid.test/auth/complete?token_hash=two&type=invite&next=/staff/setup")).toEqual({
      method: "otp",
      tokenHash: "two",
      type: "invite",
      next: "/staff/setup"
    });
  });

  it("rejects external redirect targets", () => {
    expect(safeAuthRedirect("//attacker.example/path")).toBe("/account");
    expect(safeAuthRedirect("https://attacker.example/path")).toBe("/account");
  });
});
