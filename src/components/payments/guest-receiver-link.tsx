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
      setMessage("Press and hold the link, then choose Copy.");
    }
  }

  return (
    <div className="mt-5 rounded-2xl bg-orange/10 p-4 sm:p-5">
      <p className="font-bold text-navy">Receiver payment link</p>
      <p className="mt-2 text-sm leading-6 text-slate">Send this private link to the receiver. They will not need an account.</p>
      {receiverUrl ? (
        <>
          <p className="mt-3 break-all rounded-xl bg-white p-3 text-sm text-orange">{receiverUrl}</p>
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <Button className="min-h-12" type="button" onClick={copyLink}>Copy link</Button>
            <Button className="min-h-12" type="button" variant="outline" disabled={pending} onClick={createLink}>
              {pending ? "Preparing…" : "Replace this link"}
            </Button>
          </div>
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
