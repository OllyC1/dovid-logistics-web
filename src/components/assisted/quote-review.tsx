"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

type QuoteDetails = { pickupAddress: string; deliveryAddress: string; packageDescription: string; packageCategory: string; packageSize: string; amountMinor: number; currency: string; expiresAt: string };

export function AssistedQuoteReview({ token, verified, details }: { token: string; verified: boolean; details?: QuoteDetails }) {
  const router = useRouter();
  const [isVerified, setVerified] = useState(verified);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function verify(form: FormData) {
    setPending(true); setMessage("");
    const response = await fetch(`/api/assisted/quotes/${token}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otp: form.get("otp") }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Verification failed.");
    setVerified(true); router.refresh();
  }

  async function accept(form: FormData) {
    setPending(true); setMessage("");
    const response = await fetch(`/api/assisted/quotes/${token}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payer: form.get("payer"), termsAccepted: form.get("termsAccepted") === "on", termsVersion: "2026-11", idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Quote acceptance is unavailable.");
    router.push(`/account/orders/${body.order.order_id}`);
  }

  if (!isVerified || !details) return <form action={verify} className="mx-auto max-w-lg rounded-3xl bg-white p-7 shadow-sm"><h1 className="text-3xl font-extrabold text-navy">Verify your quote</h1><p className="mt-3 text-sm leading-6 text-slate">Enter the six-digit code sent to your customer-controlled contact channel. We do not show addresses, parcel details or payment information before verification.</p><label className="mt-6 grid gap-2 text-sm font-bold text-navy">Verification code<input required name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="rounded-xl border p-4 text-center text-2xl tracking-[0.4em]" /></label><Button className="mt-5 w-full" disabled={pending} type="submit">{pending ? "Verifying…" : "Verify and review"}</Button>{message ? <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{message}</p> : null}</form>;

  return <div className="mx-auto max-w-2xl"><p className="eyebrow">Secure quote review</p><h1 className="mt-2 text-3xl font-extrabold text-navy">Review your delivery</h1><div className="mt-6 grid gap-4"><article className="rounded-3xl bg-white p-6"><h2 className="font-extrabold text-navy">Journey</h2><p className="mt-4 text-sm leading-7 text-slate">{details.pickupAddress}<br />↓<br />{details.deliveryAddress}</p></article><article className="rounded-3xl bg-white p-6"><h2 className="font-extrabold text-navy">Package and fee</h2><p className="mt-3 text-sm capitalize text-slate">{details.packageCategory} · {details.packageSize}</p><p className="mt-1 text-sm text-slate">{details.packageDescription}</p><p className="mt-5 text-3xl font-extrabold text-orange">{formatMoney(details.amountMinor, details.currency)}</p><p className="mt-2 text-xs text-slate">Quote expires {new Date(details.expiresAt).toLocaleString("en-NG")}.</p></article></div><form action={accept} className="mt-5 rounded-3xl bg-white p-6"><label className="grid gap-2 text-sm font-bold text-navy">Who will pay?<select name="payer" className="rounded-xl border p-3 font-normal"><option value="sender">Sender</option><option value="receiver_before_delivery">Receiver before delivery</option><option value="receiver_at_delivery">Receiver at delivery</option></select></label><label className="mt-5 flex items-start gap-3 text-sm text-slate"><input required name="termsAccepted" type="checkbox" className="mt-1" /><span>I confirm these delivery details and accept Dovid Logistics&apos; delivery and payment terms. I understand no cash or rider personal-account payment is accepted.</span></label><Button className="mt-5 w-full" disabled={pending} type="submit">{pending ? "Confirming…" : "Accept quote and create order"}</Button>{message ? <p role="alert" className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}</form></div>;
}

