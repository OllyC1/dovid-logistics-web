"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

type Factor = { id: string; status?: string };

export function sanitizeMfaQrCode(source: string) {
  return source.trimEnd();
}

export function MfaPanel({ mode, next = "/admin", completeOnboarding = mode === "enroll" }: { mode: "enroll" | "challenge"; next?: string; completeOnboarding?: boolean }) {
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
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) { setPending(false); setMessage("Your code was accepted, but the secure session could not be refreshed. Please try again."); return; }
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data.currentLevel !== "aal2") { setPending(false); setMessage("Your code was accepted, but privileged access is not ready yet. Please try again."); return; }
    if (mode === "challenge" || !completeOnboarding) {
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
      <Image src={sanitizeMfaQrCode(qrCode)} alt="QR code for Dovid staff authenticator setup" width={176} height={176} unoptimized className="h-44 w-44 rounded-2xl border border-navy/10 bg-white p-2" />
      <div><p className="font-bold text-navy">Can’t scan the code?</p><p className="mt-2 text-sm leading-6 text-slate">Enter this one-time setup key in your authenticator app. Keep it private.</p><code className="mt-3 block break-all rounded-xl bg-cloud p-3 text-xs text-navy">{secret}</code></div>
    </div> : null}
    <p role="status" className="rounded-2xl bg-cloud p-4 text-sm text-slate">{message}</p>
    <Field label="Six-digit authenticator code" name="mfaCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
    <Button type="button" disabled={pending || !factor || code.length !== 6} onClick={verify}>{pending ? "Verifying…" : mode === "enroll" && completeOnboarding ? "Verify and finish setup" : "Verify and continue"}</Button>
  </div>;
}

export function StaffInvitationAcceptance({ intendedRole }: { intendedRole: "admin" | "rider" }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    const response = await fetch("/api/staff/onboarding/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: form.get("firstName"), lastName: form.get("lastName"), preferredName: form.get("preferredName") || undefined, phone: form.get("phone") || undefined }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setPending(false); setMessage(body.error ?? "The invitation could not be accepted."); return; }
    setMessage("Invitation confirmed. Your account is now waiting for Super Admin approval. You do not need multifactor authentication.");
    router.replace(body.next ?? "/staff/setup");
    router.refresh();
  }
  return <form onSubmit={accept} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="First name" name="firstName" autoComplete="given-name" required /><Field label="Last name" name="lastName" autoComplete="family-name" required /><Field label="Preferred name (optional)" name="preferredName" autoComplete="nickname" /><Field label={`Mobile phone${intendedRole === "rider" ? "" : " (optional)"}`} name="phone" type="tel" autoComplete="tel" required={intendedRole === "rider"} /></div><p className="rounded-2xl bg-cloud p-4 text-sm leading-6 text-slate">These details identify you inside dispatch and the staff workspace. Riders must provide a reachable mobile number before approval.</p><Button type="submit" disabled={pending}>{pending ? "Confirming invitation…" : "Save details and confirm invitation"}</Button>{message ? <p role="status" className={`rounded-2xl p-4 text-sm font-semibold ${message.startsWith("Invitation confirmed") ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{message}</p> : null}</form>;
}
