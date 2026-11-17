"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function GuestPaymentForm({ token }: { token: string }) {
  const idempotencyKey = useRef("");
  const [state, setState] = useState({ pending: false, error: "" });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ pending: true, error: "" });
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
    if (!response.ok) return setState({ pending: false, error: body.error ?? "Payment could not start. Please try again." });
    window.location.assign(body.checkoutUrl);
  }

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
