"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => undefined;

export function ReceiverLink({ orderId }: { orderId: string }) {
  const token = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(`dovid-receiver-token-${orderId}`),
    () => null,
  );
  const [message, setMessage] = useState("");
  if (!token) return null;

  const receiverUrl = `${location.origin}/pay/receiver/${token}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Please use this private Dovid Logistics link to pay for the delivery. You do not need an account: ${receiverUrl}`)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(receiverUrl);
      setMessage("Link copied. Send it only to the person paying.");
    } catch {
      setMessage("Open the private link below, then press and hold it to copy.");
    }
  }

  return (
    <div className="mt-5 rounded-2xl bg-orange/10 p-4 sm:p-5">
      <p className="font-bold text-navy">Receiver payment link</p>
      <p className="mt-2 text-sm leading-6 text-slate">The receiver can pay securely without creating an account.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button className="min-h-12 w-full" href={whatsappUrl} target="_blank" rel="noreferrer">Send by WhatsApp</Button>
        <Button className="min-h-12 w-full" type="button" variant="outline" onClick={copyLink}>Copy private link</Button>
        <Button className="min-h-12 w-full sm:col-span-2" href={receiverUrl} target="_blank" rel="noreferrer" variant="outline">Open payment page</Button>
      </div>
      <details className="mt-3 rounded-xl border border-navy/10 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-bold text-navy">Show private link</summary>
        <p className="mt-2 break-all text-orange">{receiverUrl}</p>
      </details>
      <p className="mt-3 text-xs leading-5 text-slate">Anyone with this link can open the payment page. Send it only to the intended payer.</p>
      {message ? <p className="mt-3 text-sm leading-6 text-navy" role="status">{message}</p> : null}
    </div>
  );
}
