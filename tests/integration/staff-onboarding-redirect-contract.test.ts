import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("staff invitation onboarding contract", () => {
  const setup = readFileSync("src/app/staff/setup/page.tsx", "utf8");
  const wizard = readFileSync("src/components/staff/mfa-panel.tsx", "utf8");
  const passwordRoute = readFileSync("src/app/api/staff/onboarding/password/route.ts", "utf8");
  const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
  const resetPage = readFileSync("src/app/(auth)/reset-password/page.tsx", "utf8");

  it("does not reuse the customer current-password form for an invitation", () => {
    expect(setup).not.toContain("PasswordForm");
    expect(wizard).toContain("You will not be asked for a current password.");
    expect(passwordRoute).toContain("updateUserById");
    expect(passwordRoute).toContain("(membership && membership.status !== \"pending\")");
    expect(resetPage).toContain('redirect("/staff/setup")');
    expect(resetPage).toContain("RecoveryPasswordForm");
    expect(resetPage).not.toContain("<PasswordForm");
  });

  it("always keeps pending staff invitations on the final staff setup path", () => {
    expect(callback).toContain('staffStatus !== "active" && invitation ? "/staff/setup"');
    expect(callback).toContain("publicEnv.NEXT_PUBLIC_APP_URL");
  });

  it("presents password, identity and approval as distinct steps", () => {
    expect(wizard).toContain('"Password"');
    expect(wizard).toContain('"Your details"');
    expect(wizard).toContain('"Approval"');
  });
});
