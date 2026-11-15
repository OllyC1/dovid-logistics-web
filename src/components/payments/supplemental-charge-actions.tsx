"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SupplementalChargeActions({ id, status }: { id: string; status: string }) {
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  async function decide(action: "approve" | "reject" | "dispute") {
    setPending(action); setMessage("");
    const response = await fetch(`/api/customer/surcharges/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: action === "approve" ? undefined : "Customer requested review", idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending("");
    if (!response.ok) return setMessage(body.error ?? "Charge response failed.");
    window.location.reload();
  }
  async function pay() {
    setPending("pay"); setMessage("");
    const response = await fetch("/api/payments/supplemental", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ surchargeId: id }) });
    const body = await response.json(); setPending("");
    if (!response.ok) return setMessage(body.error ?? "Payment could not start.");
    window.location.assign(body.checkoutUrl);
  }
  return <div className="mt-4"><div className="flex flex-wrap gap-2">{status === "proposed" ? <><Button disabled={Boolean(pending)} onClick={() => decide("approve")}>Approve charge</Button><Button disabled={Boolean(pending)} variant="outline" onClick={() => decide("dispute")}>Dispute</Button><Button disabled={Boolean(pending)} variant="ghost" onClick={() => decide("reject")}>Reject</Button></> : null}{status === "customer_approved" || status === "payment_pending" ? <Button disabled={Boolean(pending)} onClick={pay}>Pay approved charge</Button> : null}</div>{message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}</div>;
}

