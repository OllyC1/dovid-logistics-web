"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function GuestPaymentForm({ token }: { token: string }) {
  const idempotencyKey = useRef("");
  const [state, setState] = useState({ pending: false, error: "", confirmed: false });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ pending: true, error: "", confirmed: false });
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/payments/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        email: form.get("email"),
        idempotencyKey: idempotencyKey.current,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setState({ pending: false, error: body.error ?? "Payment could not start. Please try again.", confirmed: false });
    if (body.confirmed) return setState({ pending: false, error: "", confirmed: true });
    window.location.assign(body.checkoutUrl);
  }

  if (state.confirmed) return <p role="status" className="mt-5 rounded-2xl bg-emerald-50 p-4 font-bold text-emerald-900">Your launch promotion covers this delivery. No payment is required.</p>;

  return (
    <form onSubmit={submit} className="mt-5 grid gap-4">
      <Field name="email" type="email" inputMode="email" autoComplete="email" label="Email address for the payment receipt" required />
      <Button className="min-h-12 w-full" type="submit" disabled={state.pending}>
        {state.pending ? "Opening secure payment…" : "Pay securely"}
      </Button>
      {state.error ? <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">{state.error}</p> : null}
    </form>
  );
}
