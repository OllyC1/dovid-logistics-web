"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

type Factor = { id: string; status?: string };

export function MfaPanel({ mode, next = "/admin" }: { mode: "enroll" | "challenge"; next?: string }) {
  const router = useRouter();
  const [factor, setFactor] = useState<Factor | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("Preparing secure sign-in…");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const listed = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (listed.error) { setMessage("We could not load your verification methods."); return; }
      const verified = listed.data.totp.find((item) => item.status === "verified");
      if (mode === "challenge") {
        if (!verified) { setMessage("Set up an authenticator before continuing."); return; }
        setFactor(verified);
        setMessage("Enter the current code from your authenticator app.");
        return;
      }
      if (verified) {
        setFactor(verified);
        setMessage("Your authenticator is ready. Enter a current code to confirm this secure session.");
        return;
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Dovid Logistics staff" });
      if (!active) return;
      if (enrolled.error) { setMessage("Authenticator setup could not be started."); return; }
      setFactor({ id: enrolled.data.id });
      setQrCode(enrolled.data.totp.qr_code);
      setSecret(enrolled.data.totp.secret);
      setMessage("Scan the QR code, then enter the six-digit code from your authenticator app.");
    })();
    return () => { active = false; };
  }, [mode]);

  async function verify() {
    if (!factor || code.trim().length !== 6) return;
    setPending(true);
    setMessage("Checking your code…");
    const supabase = createSupabaseBrowserClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) { setPending(false); setMessage("The verification challenge could not be created."); return; }
    const verified = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: code.trim() });
    if (verified.error) { setPending(false); setMessage("That code was not accepted. Wait for a new code and try again."); return; }
    if (mode === "challenge") {
      router.replace(next);
      router.refresh();
      return;
    }
    const response = await fetch("/api/staff/onboarding/complete", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setPending(false); setMessage(body.error ?? "Finish password setup, then try again."); return; }
    router.replace(body.next ?? "/account");
    router.refresh();
  }

  return <div className="grid gap-5">
    {qrCode ? <div className="grid gap-4 rounded-3xl bg-white p-5 sm:grid-cols-[180px_1fr] sm:items-center">
      <Image src={qrCode} alt="QR code for Dovid staff authenticator setup" width={176} height={176} unoptimized className="h-44 w-44 rounded-2xl border border-navy/10 bg-white p-2" />
      <div><p className="font-bold text-navy">Can’t scan the code?</p><p className="mt-2 text-sm leading-6 text-slate">Enter this one-time setup key in your authenticator app. Keep it private.</p><code className="mt-3 block break-all rounded-xl bg-cloud p-3 text-xs text-navy">{secret}</code></div>
    </div> : null}
    <p role="status" className="rounded-2xl bg-cloud p-4 text-sm text-slate">{message}</p>
    <Field label="Six-digit authenticator code" name="mfaCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
    <Button type="button" disabled={pending || !factor || code.length !== 6} onClick={verify}>{pending ? "Verifying…" : mode === "enroll" ? "Verify and finish setup" : "Verify and continue"}</Button>
  </div>;
}

export function StaffInvitationAcceptance() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function accept() {
    setPending(true);
    const response = await fetch("/api/staff/onboarding/complete", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setPending(false); setMessage(body.error ?? "The invitation could not be accepted."); return; }
    setMessage("Invitation accepted. An administrator must complete identity and rider readiness checks before access is activated.");
    router.refresh();
  }
  return <div className="grid gap-4"><Button type="button" onClick={accept} disabled={pending}>{pending ? "Accepting…" : "Accept staff invitation"}</Button>{message ? <p role="status" className="rounded-2xl bg-cloud p-4 text-sm text-slate">{message}</p> : null}</div>;
}
