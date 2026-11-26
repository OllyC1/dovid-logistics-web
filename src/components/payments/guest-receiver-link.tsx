"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => undefined;

export function GuestReceiverLink({ orderId, guestToken }: { orderId: string; guestToken: string }) {
  const storedToken = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(`dovid-receiver-token-${orderId}`),
    () => null,
  );
  const [newToken, setNewToken] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const receiverToken = newToken || storedToken || "";
  const receiverUrl = receiverToken && typeof window !== "undefined" ? `${window.location.origin}/pay/receiver/${receiverToken}` : "";
  const whatsappUrl = receiverUrl
    ? `https://wa.me/?text=${encodeURIComponent(`Please use this private Dovid Logistics link to pay for the delivery. You do not need an account: ${receiverUrl}`)}`
    : "";

  async function createLink() {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/guest/orders/${guestToken}/receiver-link`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error ?? "We could not prepare the receiver payment link.");
    sessionStorage.setItem(`dovid-receiver-token-${orderId}`, body.receiverToken);
    setNewToken(body.receiverToken);
    setMessage("Receiver payment link is ready.");
  }

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
      <p className="mt-2 text-sm leading-6 text-slate">Send this private link to the receiver. They will not need an account.</p>
      {receiverUrl ? (
        <>
          <ol className="mt-3 grid gap-2 rounded-xl bg-white p-4 text-sm leading-6 text-slate">
            <li><span className="font-bold text-navy">1.</span> Send the private link to the person paying.</li>
            <li><span className="font-bold text-navy">2.</span> They enter their receipt email and pay securely through Paystack.</li>
          </ol>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button className="min-h-12 w-full" href={whatsappUrl} target="_blank" rel="noreferrer">Send by WhatsApp</Button>
            <Button className="min-h-12 w-full" type="button" variant="outline" onClick={copyLink}>Copy private link</Button>
            <Button className="min-h-12 w-full" href={receiverUrl} target="_blank" rel="noreferrer" variant="outline">Open payment page</Button>
            <Button className="min-h-12 w-full" type="button" variant="ghost" disabled={pending} onClick={createLink}>
              {pending ? "Preparing…" : "Create a new link"}
            </Button>
          </div>
          <details className="mt-3 rounded-xl border border-navy/10 bg-white p-3 text-sm">
            <summary className="cursor-pointer font-bold text-navy">Show private link</summary>
            <p className="mt-2 break-all text-orange">{receiverUrl}</p>
          </details>
          <p className="mt-3 text-xs leading-5 text-slate">Anyone with this link can open the payment page. Send it only to the intended payer.</p>
        </>
      ) : (
        <Button className="mt-4 min-h-12 w-full sm:w-auto" type="button" disabled={pending} onClick={createLink}>
          {pending ? "Preparing link…" : "Create receiver payment link"}
        </Button>
      )}
      {message ? <p role="status" className="mt-3 text-sm leading-6 text-navy">{message}</p> : null}
    </div>
  );
}
