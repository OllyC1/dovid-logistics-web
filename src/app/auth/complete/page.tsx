"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseAuthCallbackUrl } from "@/lib/auth/callback";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AuthCompletePage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function completeAuthentication() {
      const callback = parseAuthCallbackUrl(window.location.href);
      window.history.replaceState(null, "", `/auth/complete?next=${encodeURIComponent(callback.next)}`);
      if (callback.method === "error") {
        if (active) setFailed(true);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const result = callback.method === "otp"
        ? await supabase.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type })
        : await supabase.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
      if (result.error) {
        if (active) setFailed(true);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        if (active) setFailed(true);
        return;
      }
      window.location.replace(callback.next);
    }
    void completeAuthentication();
    return () => { active = false; };
  }, []);

  return <main className="container max-w-xl py-20 text-center">
    <p className="eyebrow">Secure account verification</p>
    <h1 className="mt-3 text-3xl font-extrabold text-navy">{failed ? "This link cannot be used" : "Confirming your secure link…"}</h1>
    <p className="mt-4 leading-7 text-slate">{failed ? "The link may have expired or already been used. Request a fresh link and try again." : "Please wait while we verify your account and protect your session."}</p>
    {failed ? <Link className="mt-7 inline-flex font-bold text-orange" href="/login">Return to login</Link> : null}
  </main>;
}
