"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import type { DeliveryStatus, PaymentStatus } from "@/types/domain";

type ExistingProof = { completedAt: string; recipientName: string | null } | null;

export function DeliveryProofForm({ orderId, expectedRecipientName, deliveryStatus, paymentStatus, existingProof }: { orderId: string; expectedRecipientName: string; deliveryStatus: DeliveryStatus; paymentStatus: PaymentStatus; existingProof: ExistingProof }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const canRecord = ["arrived_at_destination", "awaiting_payment"].includes(deliveryStatus);

  async function recordProof(form: FormData) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/rider/orders/${orderId}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientName: form.get("recipientName"), notes: form.get("notes") || undefined, identityConfirmed: form.get("identityConfirmed") === "on" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setFeedback({ text: body.error ?? "Recipient confirmation could not be recorded.", ok: false });
      setFeedback({ text: body.alreadyRecorded ? "Recipient confirmation was already recorded." : "Recipient confirmation recorded. You can now complete the paid handover.", ok: true });
      router.refresh();
    } catch {
      setFeedback({ text: "We could not record the confirmation. Keep the parcel and check your connection before trying again.", ok: false });
    } finally {
      setPending(false);
    }
  }

  if (existingProof) return <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6" aria-labelledby="delivery-proof-title"><h2 id="delivery-proof-title" className="font-extrabold text-emerald-950">Recipient confirmation recorded</h2><p className="mt-2 text-sm leading-6 text-emerald-900">Received by {existingProof.recipientName || "the confirmed recipient"} at {new Date(existingProof.completedAt).toLocaleString("en-NG")}.</p><p className="mt-2 text-xs leading-5 text-emerald-900">Payment is checked again on the server when you complete delivery. Do not release the parcel if the app blocks handover.</p></section>;
  if (!canRecord) return null;

  return <section className="mt-5 rounded-3xl bg-white p-4 sm:p-6" aria-labelledby="delivery-proof-title">
    <h2 id="delivery-proof-title" className="font-extrabold text-navy">Confirm the recipient before handover</h2>
    {paymentStatus !== "paid" ? <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">Verified payment is still outstanding. Keep the parcel and ask the payer to use the secure Dovid payment link.</p> : <form action={recordProof} className="mt-4 grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-navy">Name of person receiving the parcel<input required minLength={2} maxLength={120} name="recipientName" defaultValue={expectedRecipientName} autoComplete="name" className="min-h-12 min-w-0 rounded-2xl border border-slate/25 px-4 text-base font-normal" /></label>
      <label className="grid gap-2 text-sm font-bold text-navy">Handover notes (optional)<textarea name="notes" maxLength={1000} placeholder="For example: recipient checked the parcel condition" className="min-h-24 min-w-0 rounded-2xl border border-slate/25 p-4 text-base font-normal" /></label>
      <label className="flex min-h-12 items-start gap-3 rounded-2xl border border-navy/10 p-4 text-sm font-semibold leading-6 text-navy"><input required name="identityConfirmed" type="checkbox" className="mt-0.5 size-5 shrink-0" />I checked the recipient&apos;s identity and they confirmed receipt of this parcel.</label>
      <Button className="w-full sm:w-auto" disabled={pending} type="submit">{pending ? "Recording confirmation…" : "Record recipient confirmation"}</Button>
    </form>}
    <ActionFeedback feedback={feedback} pending={pending} pendingText="Recording recipient confirmation…" onDismiss={() => setFeedback(null)} />
  </section>;
}
