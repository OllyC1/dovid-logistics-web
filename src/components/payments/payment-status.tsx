"use client";

import { useEffect, useState } from "react";

export function PaymentStatus({ reference }: { reference: string }) {
  const [state, setState] = useState({ pending: true, status: "processing", error: "" });
  useEffect(() => {
    let active = true;
    fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`, { cache: "no-store" })
      .then(async response => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) setState({ pending: false, status: "unverified", error: body.error ?? "We could not confirm this payment yet." });
        else setState({ pending: false, status: body.status, error: "" });
      })
      .catch(() => active && setState({ pending: false, status: "unverified", error: "We could not confirm this payment yet." }));
    return () => { active = false; };
  }, [reference]);

  if (state.pending) return <p className="mt-4 leading-7 text-slate">We are securely checking this payment with Paystack.</p>;
  if (state.status === "paid") return <p role="status" className="mt-4 rounded-2xl bg-emerald-50 p-4 leading-7 text-emerald-900">Payment confirmed. Your delivery can continue.</p>;
  return <p role="alert" className="mt-4 rounded-2xl bg-amber-50 p-4 leading-7 text-amber-900">{state.error || "Payment is still pending. We will update the delivery when Paystack confirms it."}</p>;
}
