import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getVerifiedAuthenticatorAssuranceLevel } from "@/lib/auth/assurance";

function client({ token = "session-token", assuranceError = null }: { token?: string | null; assuranceError?: Error | null } = {}) {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
    error: null,
  });
  const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
    data: { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] },
    error: assuranceError,
  });
  const supabase = { auth: { getSession, mfa: { getAuthenticatorAssuranceLevel } } } as unknown as SupabaseClient;
  return { supabase, getSession, getAuthenticatorAssuranceLevel };
}

describe("verified server MFA assurance", () => {
  it("passes a supplied sign-in token directly to Supabase verification", async () => {
    const { supabase, getSession, getAuthenticatorAssuranceLevel } = client();
    await expect(getVerifiedAuthenticatorAssuranceLevel(supabase, "fresh-token")).resolves.toMatchObject({ currentLevel: "aal2" });
    expect(getSession).not.toHaveBeenCalled();
    expect(getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("fresh-token");
  });

  it("reads only the access token from the server session and verifies it remotely", async () => {
    const { supabase, getAuthenticatorAssuranceLevel } = client({ token: "cookie-token" });
    await expect(getVerifiedAuthenticatorAssuranceLevel(supabase)).resolves.toMatchObject({ nextLevel: "aal2" });
    expect(getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("cookie-token");
  });

  it("fails closed when there is no token or Supabase cannot verify assurance", async () => {
    const missing = client({ token: null });
    await expect(getVerifiedAuthenticatorAssuranceLevel(missing.supabase)).resolves.toBeNull();
    expect(missing.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();

    const failed = client({ assuranceError: new Error("verification unavailable") });
    await expect(getVerifiedAuthenticatorAssuranceLevel(failed.supabase)).resolves.toBeNull();
  });
});
