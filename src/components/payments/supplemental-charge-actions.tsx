"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SupplementalChargeActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  async function decide(action: "approve" | "reject" | "dispute") {
    setPending(action); setFeedback(null);
    const response = await fetch(`/api/customer/surcharges/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: action === "approve" ? undefined : "Customer requested review", idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending("");
    if (!response.ok) return setFeedback({ text: body.error ?? "Charge response failed.", ok: false });
    const success = action === "approve" ? "Charge approved. You can now complete its separate secure payment." : action === "dispute" ? "Charge marked for review. Delivery staff can see that it is disputed." : "Charge rejected. No payment was taken.";
    setFeedback({ text: success, ok: true });
    router.refresh();
  }
  async function pay() {
    setPending("pay"); setFeedback(null);
    const response = await fetch("/api/payments/supplemental", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ surchargeId: id }) });
    const body = await response.json(); setPending("");
    if (!response.ok) return setFeedback({ text: body.error ?? "Payment could not start.", ok: false });
    window.location.assign(body.checkoutUrl);
  }
  return <div className="mt-4"><div className="grid gap-2 sm:flex sm:flex-wrap">{status === "proposed" ? <><Button disabled={Boolean(pending)} onClick={() => decide("approve")}>{pending === "approve" ? "Approving…" : "Approve charge"}</Button><Button disabled={Boolean(pending)} variant="outline" onClick={() => decide("dispute")}>{pending === "dispute" ? "Submitting…" : "Dispute"}</Button><Button disabled={Boolean(pending)} variant="ghost" onClick={() => decide("reject")}>{pending === "reject" ? "Rejecting…" : "Reject"}</Button></> : null}{status === "customer_approved" || status === "payment_pending" ? <Button disabled={Boolean(pending)} onClick={pay}>{pending === "pay" ? "Opening checkout…" : "Pay approved charge"}</Button> : null}</div>{feedback ? <p role={feedback.ok ? "status" : "alert"} className={`mt-3 rounded-xl p-3 text-sm ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{feedback.text}</p> : null}</div>;
}

