"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { formatMoney } from "@/lib/utils";
import type { DeliveryStatus } from "@/types/domain";

type Feedback = { text: string; ok: boolean } | null;
type WaitingSession = { id: string; startedAt: string; freeMinutes: number };

export function DeliveryOperationsForms({
  orderId,
  runId,
  deliveryStatus,
  activeWaitingSession,
  returnInProgress = false,
}: {
  orderId: string;
  runId?: string | null;
  deliveryStatus: DeliveryStatus;
  activeWaitingSession: WaitingSession | null;
  returnInProgress?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [stoppedWaitingId, setStoppedWaitingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const waiting = activeWaitingSession?.id === stoppedWaitingId ? null : activeWaitingSession;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const elapsedSeconds = waiting ? Math.max(0, Math.floor((now - new Date(waiting.startedAt).getTime()) / 1_000)) : 0;
  const freeSecondsRemaining = waiting ? Math.max(0, waiting.freeMinutes * 60 - elapsedSeconds) : 0;
  const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const canReportExpense = !["delivered", "cancelled"].includes(deliveryStatus);
  const canReportFailure = !returnInProgress && ["rider_en_route_to_pickup", "picked_up", "in_transit", "arrived_at_destination", "awaiting_payment"].includes(deliveryStatus);

  async function reportExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending("expense");
    setFeedback(null);
    const amountKobo = Math.round(Number(form.get("amountNaira")) * 100);
    try {
      const response = await fetch("/api/rider/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, runId: runId ?? null, category: form.get("category"), amountKobo, description: form.get("description"), occurredAt: new Date().toISOString(), alreadyIncurred: form.get("alreadyIncurred") === "on", customerApprovalObtained: false, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      setFeedback({
        text: response.ok ? "Cost sent to dispatch for review. This did not mark the delivery as failed and the customer was not charged." : body.error ?? "The cost could not be submitted.",
        ok: response.ok,
      });
      if (response.ok) formElement.reset();
    } catch {
      setFeedback({ text: "We could not reach operations. Check your connection and try again.", ok: false });
    } finally {
      setPending("");
    }
  }

  async function reportAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending("attempt");
    setFeedback(null);
    try {
      const response = await fetch("/api/rider/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, runId: runId ?? null, status: form.get("status"), contactAttempts: [], waitingDurationSeconds: elapsedSeconds, failureReason: form.get("reason"), evidence: {}, riderNotes: form.get("notes") || undefined, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      setFeedback({ text: response.ok ? "Delivery issue recorded. Dispatch will choose and approve the next safe step." : body.error ?? "The delivery issue could not be recorded.", ok: response.ok });
      if (response.ok) {
        if (waiting) setStoppedWaitingId(waiting.id);
        formElement.reset();
        router.refresh();
      }
    } catch {
      setFeedback({ text: "We could not reach operations. Check your connection and try again.", ok: false });
    } finally {
      setPending("");
    }
  }

  async function stopWaiting() {
    if (!waiting) return;
    setPending("waiting");
    setFeedback(null);
    try {
      const response = await fetch(`/api/rider/waiting/${waiting.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedSeconds: 0, expenseIdempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback({ text: body.error ?? "The waiting timer could not be stopped.", ok: false });
        return;
      }
      setStoppedWaitingId(waiting.id);
      setFeedback({
        text: body.chargeKobo === null
          ? "Waiting time recorded. Dispatch must review the pricing setup."
          : `Waiting time recorded. Proposed amount: ${formatMoney(body.chargeKobo, "NGN")}. The customer has not been charged.`,
        ok: true,
      });
      router.refresh();
    } catch {
      setFeedback({ text: "We could not stop the timer. Your server-recorded time is preserved; check your connection and try again.", ok: false });
    } finally {
      setPending("");
    }
  }

  return <section className="mt-5 grid gap-4" aria-label="Delivery help and exceptions">
    {!returnInProgress && deliveryStatus === "arrived_at_destination" ? <div className="rounded-3xl border-2 border-orange bg-white p-4 sm:p-6">
      <p className="text-xs font-extrabold uppercase tracking-widest text-orange">Waiting time</p>
      {waiting ? <>
        <p className="mt-2 text-3xl font-extrabold tabular-nums text-navy">{timeLabel(elapsedSeconds)}</p>
        <p className="mt-2 text-sm leading-6 text-slate">{freeSecondsRemaining > 0 ? `${timeLabel(freeSecondsRemaining)} of free waiting time remains.` : "The free waiting period has ended. Any proposed charge still needs dispatch review and customer approval."}</p>
        <Button className="mt-4 w-full sm:w-auto" disabled={Boolean(pending)} onClick={stopWaiting}>{pending === "waiting" ? "Stopping timer…" : "Stop waiting timer"}</Button>
      </> : <p className="mt-2 text-sm leading-6 text-slate">Arrival was recorded. The secure server is starting the timer automatically; refresh this page if it does not appear within a few seconds.</p>}
    </div> : null}

    {canReportExpense ? <details className="group rounded-3xl bg-white p-4 sm:p-6">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-navy"><span>Request an additional cost</span><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary>
      <p className="mt-2 text-sm leading-6 text-slate">Use this only for a real toll, access cost, extra stop or other approved delivery cost. It never marks the delivery as failed and never charges the customer automatically.</p>
      <form onSubmit={reportExpense} className="mt-4 border-t border-navy/10 pt-4">
        <label className="grid gap-2 text-sm font-bold text-navy">Cost type<select name="category" className="min-h-12 w-full rounded-xl border p-3 font-normal"><option value="toll_road_access">Toll or road access</option><option value="authorized_parking_access">Authorized parking or access</option><option value="extra_stop">Extra stop</option><option value="address_correction">Address correction</option><option value="return_journey">Return journey</option><option value="redelivery">Redelivery</option><option value="other">Other</option></select></label>
        <label className="mt-3 grid gap-2 text-sm font-bold text-navy">Amount (NGN)<input required name="amountNaira" inputMode="decimal" type="number" min={1} step="0.01" placeholder="For example, 500" className="min-h-12 w-full rounded-xl border p-3 text-base font-normal"/></label>
        <label className="mt-3 grid gap-2 text-sm font-bold text-navy">What happened?<textarea required minLength={5} name="description" className="min-h-24 w-full rounded-xl border p-3 text-base font-normal"/></label>
        <label className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm font-bold text-navy"><input name="alreadyIncurred" type="checkbox" className="size-5 shrink-0"/>This cost has already been paid</label>
        <Button className="mt-4 w-full sm:w-auto" disabled={Boolean(pending)} type="submit">{pending === "expense" ? "Submitting cost…" : "Send cost for review"}</Button>
      </form>
    </details> : null}

    {canReportFailure ? <details className="group rounded-3xl border border-red-200 bg-white p-4 sm:p-6">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-red-800"><span>Could not deliver this parcel</span><span aria-hidden="true" className="text-2xl transition group-open:rotate-45">+</span></summary>
      <p className="mt-2 text-sm leading-6 text-slate">Use this only when handover genuinely failed. It changes the delivery to failed and sends it to dispatch for the next decision.</p>
      <form onSubmit={reportAttempt} className="mt-4 border-t border-red-100 pt-4">
        <label className="grid gap-2 text-sm font-bold text-navy">What stopped the delivery?<select name="status" className="min-h-12 w-full rounded-xl border p-3 font-normal"><option value="recipient_unavailable">Recipient unavailable</option><option value="address_problem">Address problem</option><option value="recipient_refused">Recipient refused</option><option value="payment_refused">Receiver refused payment</option><option value="access_blocked">Access blocked</option><option value="unsafe_delivery">Unsafe delivery area</option><option value="incident_escalated">Escalate an incident</option></select></label>
        <label className="mt-3 grid gap-2 text-sm font-bold text-navy">What happened?<input required minLength={3} name="reason" className="min-h-12 w-full rounded-xl border p-3 text-base font-normal"/></label>
        <label className="mt-3 grid gap-2 text-sm font-bold text-navy">Private notes for dispatch<textarea name="notes" className="min-h-20 w-full rounded-xl border p-3 text-base font-normal"/></label>
        <Button className="mt-4 w-full sm:w-auto" variant="outline" disabled={Boolean(pending)} type="submit">{pending === "attempt" ? "Recording issue…" : "Send issue to dispatch"}</Button>
      </form>
    </details> : null}
    <ActionFeedback feedback={feedback} pending={Boolean(pending)} pendingText="Updating this delivery…" onDismiss={() => setFeedback(null)} />
  </section>;
}
