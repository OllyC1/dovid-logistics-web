"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function PaymentButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState({ pending: false, error: "" });
  const idempotencyKey = useRef("");
  async function pay() {
    setState({ pending: true, error: "" });
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    const response = await fetch("/api/payments/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, idempotencyKey: idempotencyKey.current }) });
    const body = await response.json();
    if (!response.ok) return setState({ pending: false, error: body.error });
    location.assign(body.checkoutUrl);
  }
  return <div className="grid gap-3"><Button onClick={pay} disabled={state.pending}>{state.pending ? "Opening checkout…" : "Pay now"}</Button>{state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}</div>;
}
