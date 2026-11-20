import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server authorization must not derive MFA state from the user object cached in
 * the session cookie. Passing the access token makes Supabase validate the user
 * and enrolled factors before returning the assurance level.
 */
export async function getVerifiedAuthenticatorAssuranceLevel(
  supabase: SupabaseClient,
  accessToken?: string | null,
) {
  let token = accessToken;
  if (!token) {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    token = data.session?.access_token;
  }
  if (!token) return null;

  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(token);
  return error ? null : data;
}
