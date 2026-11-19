"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";

export function ReturnToSenderForm({ orderId, expectedSenderName }: { orderId: string; expectedSenderName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  async function completeReturn(form: FormData) {
    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/rider/orders/${orderId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: form.get("recipientName"),
          notes: form.get("notes") || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback({ text: body.error ?? "The return could not be completed.", ok: false });
        return;
      }

      setFeedback({ text: "Return completed. Parcel custody is now recorded with the sender.", ok: true });
      router.refresh();
    } catch {
      setFeedback({
        text: "We could not record the return. Keep the parcel and check your connection before trying again.",
        ok: false,
      });
    } finally {
      setPending(false);
    }
  }

  return <section className="mt-5 rounded-3xl border border-orange/25 bg-orange/5 p-4 sm:p-6" aria-labelledby="return-to-sender-title">
    <h2 id="return-to-sender-title" className="font-extrabold text-navy">Complete the return to sender</h2>
    <p className="mt-2 text-sm leading-6 text-slate">Dispatch has authorized this return. Hand the parcel back only to the confirmed sender or their authorized representative, then record who accepted it.</p>
    <form action={completeReturn} className="mt-4 grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-navy">
        Name of person accepting the return
        <input required minLength={2} maxLength={120} name="recipientName" defaultValue={expectedSenderName} autoComplete="name" className="min-h-12 min-w-0 rounded-2xl border border-slate/25 bg-white px-4 text-base font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-bold text-navy">
        Return notes (optional)
        <textarea name="notes" maxLength={1000} placeholder="For example: sender checked the parcel condition" className="min-h-24 min-w-0 rounded-2xl border border-slate/25 bg-white p-4 text-base font-normal" />
      </label>
      <Button className="w-full sm:w-auto" disabled={pending} type="submit">{pending ? "Recording return..." : "Confirm parcel returned"}</Button>
    </form>
    <ActionFeedback feedback={feedback} pending={pending} pendingText="Recording return custody..." onDismiss={() => setFeedback(null)} />
  </section>;
}
