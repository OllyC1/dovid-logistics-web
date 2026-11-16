import { describe, expect, it } from "vitest";
import { isStrongNewPassword } from "@/lib/auth/password-policy";

describe("new password policy", () => {
  it("accepts a strong password", () => {
    expect(isStrongNewPassword("Dovid-Route9!Safe")).toBe(true);
  });

  it.each([
    "Short9!a",
    "all-lowercase9!",
    "ALL-UPPERCASE9!",
    "NoNumbersHere!",
    "NoSymbolHere99",
    "Has A Space9!x",
  ])("rejects an unsafe password: %s", (password) => {
    expect(isStrongNewPassword(password)).toBe(false);
  });
});
