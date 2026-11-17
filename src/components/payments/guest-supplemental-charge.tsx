"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatMoney } from "@/lib/utils";

type Props = {
  id: string;
  token: string;
  category: string;
  description: string;
  amountMinor: number;
  currency: string;
  status: string;
};

export function GuestSupplementalCharge({ id, token, category, description, amountMinor, currency, status }: Props) {
  const router = useRouter();
  const responseKey = useRef("");
  const paymentKey = useRef("");
  const [pending, setPending] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  async function decide(action: "approve" | "reject" | "dispute") {
    if (action !== "approve" && reason.trim().length < 3) {
      return setFeedback({ text: "Please add a short reason so our team knows what to review.", ok: false });
    }
    setPending(action);
    setFeedback(null);
    if (!responseKey.current) responseKey.current = crypto.randomUUID();
    const response = await fetch(`/api/guest/orders/${token}/surcharges/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: reason.trim() || undefined, idempotencyKey: responseKey.current }),
    });
    const body = await response.json().catch(() => ({}));
    setPending("");
    if (!response.ok) return setFeedback({ text: body.error ?? "We could not save your response.", ok: false });
    setFeedback({
      text: action === "approve" ? "Charge approved. Complete its separate payment below." : "Your response has been sent to the dispatch team.",
      ok: true,
    });
    router.refresh();
  }

  async function pay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("pay");
    setFeedback(null);
    if (!paymentKey.current) paymentKey.current = crypto.randomUUID();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/payments/guest/supplemental", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, surchargeId: id, email: form.get("email"), idempotencyKey: paymentKey.current }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPending("");
      return setFeedback({ text: body.error ?? "Payment could not start.", ok: false });
    }
    window.location.assign(body.checkoutUrl);
  }

  return (
    <article className="rounded-2xl border border-navy/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold capitalize text-navy">{category.replaceAll("_", " ")}</p>
          <p className="mt-1 text-sm leading-6 text-slate">{description}</p>
        </div>
        <p className="font-extrabold text-orange">{formatMoney(amountMinor, currency)}</p>
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate">{status.replaceAll("_", " ")}</p>

      {status === "proposed" ? (
        <div className="mt-4 grid gap-3">
          <Field label="Reason (needed only to dispute or reject)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button className="min-h-12" disabled={Boolean(pending)} onClick={() => decide("approve")}>{pending === "approve" ? "Approving…" : "Approve charge"}</Button>
            <Button className="min-h-12" disabled={Boolean(pending)} variant="outline" onClick={() => decide("dispute")}>{pending === "dispute" ? "Sending…" : "Ask us to review"}</Button>
            <Button className="min-h-12" disabled={Boolean(pending)} variant="ghost" onClick={() => decide("reject")}>{pending === "reject" ? "Sending…" : "Reject charge"}</Button>
          </div>
        </div>
      ) : null}

      {status === "customer_approved" || status === "payment_pending" ? (
        <form onSubmit={pay} className="mt-4 grid gap-3">
          <Field name="email" type="email" inputMode="email" autoComplete="email" label="Email address for the payment receipt" required />
          <Button className="min-h-12 w-full sm:w-auto" type="submit" disabled={Boolean(pending)}>
            {pending === "pay" ? "Opening secure payment…" : "Pay this charge"}
          </Button>
        </form>
      ) : null}
      {feedback ? <p role={feedback.ok ? "status" : "alert"} className={`mt-3 rounded-xl p-3 text-sm leading-6 ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{feedback.text}</p> : null}
    </article>
  );
}
