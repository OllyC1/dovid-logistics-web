"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReceiverPaymentLink({ orderId }: { orderId: string }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function createLink() {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/rider/orders/${orderId}/payment-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Payment link could not be created.");
    setUrl(body.paymentUrl);
    setMessage("Link ready. Send it to the receiver by WhatsApp or text.");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Payment link copied.");
    } catch {
      setMessage("Press and hold the link, then choose Copy.");
    }
  }

  return (
    <div className="mt-5 rounded-2xl bg-orange/10 p-4">
      <p className="font-bold text-navy">Receiver payment</p>
      <p className="mt-1 text-sm leading-6 text-slate">Create a secure link when the receiver must pay. Do not hand over the parcel until payment is verified.</p>
      {url ? <><p className="mt-3 break-all rounded-xl bg-white p-3 text-sm text-orange">{url}</p><Button className="mt-3 min-h-11" type="button" onClick={copyLink}>Copy payment link</Button></> : <Button className="mt-3 min-h-11" type="button" disabled={pending} onClick={createLink}>{pending ? "Preparing…" : "Create payment link"}</Button>}
      {message ? <p role="status" className="mt-3 text-sm text-navy">{message}</p> : null}
    </div>
  );
}
