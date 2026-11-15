import type { EmailOtpType } from "@supabase/supabase-js";

const emailOtpTypes = new Set<EmailOtpType>(["email", "signup", "invite", "magiclink", "recovery", "email_change"]);

export type AuthCallback =
  | { method: "otp"; tokenHash: string; type: EmailOtpType; next: string }
  | { method: "session"; accessToken: string; refreshToken: string; next: string }
  | { method: "error"; next: string };

export function safeAuthRedirect(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

export function parseAuthCallbackUrl(value: string): AuthCallback {
  const url = new URL(value);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const next = safeAuthRedirect(url.searchParams.get("next"));
  if (url.searchParams.has("error") || fragment.has("error")) return { method: "error", next };

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && emailOtpTypes.has(type)) return { method: "otp", tokenHash, type, next };

  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) return { method: "session", accessToken, refreshToken, next };

  return { method: "error", next };
}
