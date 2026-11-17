"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Feedback = { text: string; ok: boolean } | null;

export function DeliveryOperationsForms({ orderId, runId }: { orderId: string; runId?: string | null }) {
  const [pending, setPending] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [waitingId, setWaitingId] = useState("");

  async function reportExpense(form: FormData) {
    setPending("expense");
    setFeedback(null);
    const amountKobo = Math.round(Number(form.get("amountNaira")) * 100);
    const response = await fetch("/api/rider/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, runId: runId ?? null, category: form.get("category"), amountKobo, description: form.get("description"), occurredAt: new Date().toISOString(), alreadyIncurred: form.get("alreadyIncurred") === "on", customerApprovalObtained: false, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json();
    setPending("");
    setFeedback({ text: response.ok ? "Expense submitted for review. The customer was not charged." : body.error ?? "The expense could not be submitted.", ok: response.ok });
  }

  async function reportAttempt(form: FormData) {
    setPending("attempt");
    setFeedback(null);
    const status = String(form.get("status"));
    const waitingDurationSeconds = Math.round(Number(form.get("waitingMinutes") || 0) * 60);
    const response = await fetch("/api/rider/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, runId: runId ?? null, status, contactAttempts: [], waitingDurationSeconds, failureReason: form.get("reason"), evidence: {}, riderNotes: form.get("notes") || undefined, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json();
    setPending("");
    setFeedback({ text: response.ok ? "Delivery attempt recorded. Dispatch will choose the next safe step." : body.error ?? "The delivery attempt could not be recorded.", ok: response.ok });
  }

  async function startWaiting() {
    setPending("waiting");
    setFeedback(null);
    const response = await fetch("/api/rider/waiting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, runId: runId ?? null, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json();
    setPending("");
    if (!response.ok) return setFeedback({ text: body.error ?? "The waiting timer could not be started.", ok: false });
    setWaitingId(body.id);
    setFeedback({ text: "Waiting timer started. Keep this page open and stop it when the wait ends.", ok: true });
  }

  async function stopWaiting() {
    setPending("waiting");
    setFeedback(null);
    const response = await fetch(`/api/rider/waiting/${waitingId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excludedSeconds: 0, expenseIdempotencyKey: crypto.randomUUID() }) });
    const body = await response.json();
    setPending("");
    if (!response.ok) return setFeedback({ text: body.error ?? "The waiting timer could not be stopped.", ok: false });
    setWaitingId("");
    setFeedback({ text: body.chargeKobo === null ? "Waiting time recorded. Dispatch must review the pricing setup." : `Waiting time recorded. Proposed amount: ₦${(body.chargeKobo / 100).toFixed(2)}. The customer has not been charged.`, ok: true });
  }

  return <section className="mt-5 grid gap-5 lg:grid-cols-2">
    <form action={reportExpense} className="rounded-3xl bg-white p-4 sm:p-6">
      <h3 className="font-extrabold text-navy">Report an operating expense</h3>
      <p className="mt-2 text-sm leading-6 text-slate">Dispatch reviews every expense. This form never charges a customer automatically.</p>
      <label className="mt-4 grid gap-2 text-sm font-bold text-navy">Expense type<select name="category" className="min-h-12 w-full rounded-xl border p-3 font-normal"><option value="toll_road_access">Toll or road access</option><option value="authorized_parking_access">Authorized parking or access</option><option value="extra_stop">Extra stop</option><option value="address_correction">Address correction</option><option value="return_journey">Return journey</option><option value="redelivery">Redelivery</option><option value="other">Other</option></select></label>
      <label className="mt-3 grid gap-2 text-sm font-bold text-navy">Amount (NGN)<input required name="amountNaira" inputMode="decimal" type="number" min={1} step="0.01" placeholder="For example, 500" className="min-h-12 w-full rounded-xl border p-3 text-base font-normal"/></label>
      <label className="mt-3 grid gap-2 text-sm font-bold text-navy">What happened?<textarea required minLength={5} name="description" className="min-h-24 w-full rounded-xl border p-3 text-base font-normal"/></label>
      <label className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm font-bold text-navy"><input name="alreadyIncurred" type="checkbox" className="size-5 shrink-0"/>This cost has already been paid</label>
      <Button className="mt-4 w-full sm:w-auto" disabled={Boolean(pending)} type="submit">{pending === "expense" ? "Submitting expense…" : "Submit for review"}</Button>
    </form>
    <form action={reportAttempt} className="rounded-3xl bg-white p-4 sm:p-6">
      <h3 className="font-extrabold text-navy">Report a failed or missed attempt</h3>
      <p className="mt-2 text-sm leading-6 text-slate">Record the facts for dispatch. Do not promise a retry or redelivery until dispatch confirms it.</p>
      <label className="mt-4 grid gap-2 text-sm font-bold text-navy">What stopped the delivery?<select name="status" className="min-h-12 w-full rounded-xl border p-3 font-normal"><option value="recipient_unavailable">Recipient unavailable</option><option value="address_problem">Address problem</option><option value="recipient_refused">Recipient refused</option><option value="payment_refused">Receiver refused payment</option><option value="access_blocked">Access blocked</option><option value="unsafe_delivery">Unsafe delivery area</option><option value="incident_escalated">Escalate an incident</option></select></label>
      <label className="mt-3 grid gap-2 text-sm font-bold text-navy">Reason<input required minLength={3} name="reason" className="min-h-12 w-full rounded-xl border p-3 text-base font-normal"/></label>
      <label className="mt-3 grid gap-2 text-sm font-bold text-navy">Time spent waiting (minutes)<input name="waitingMinutes" inputMode="decimal" type="number" min={0} step="0.5" placeholder="For example, 10" className="min-h-12 w-full rounded-xl border p-3 text-base font-normal"/></label>
      <label className="mt-3 grid gap-2 text-sm font-bold text-navy">Private notes for dispatch<textarea name="notes" className="min-h-20 w-full rounded-xl border p-3 text-base font-normal"/></label>
      <Button className="mt-4 w-full sm:w-auto" variant="outline" disabled={Boolean(pending)} type="submit">{pending === "attempt" ? "Recording attempt…" : "Record attempt safely"}</Button>
    </form>
    <div className="rounded-3xl bg-white p-4 sm:p-6 lg:col-span-2">
      <h3 className="font-extrabold text-navy">Recipient waiting timer</h3>
      <p className="mt-2 text-sm leading-6 text-slate">Start this when you arrive and are ready to hand over. The server records the time; any extra charge still needs review and approval.</p>
      <Button className="mt-4 w-full sm:w-auto" disabled={Boolean(pending)} onClick={waitingId ? stopWaiting : startWaiting}>{pending === "waiting" ? "Updating timer…" : waitingId ? "Stop waiting timer" : "Start waiting timer"}</Button>
    </div>
    {feedback ? <p role={feedback.ok ? "status" : "alert"} className={`rounded-2xl p-4 text-sm lg:col-span-2 ${feedback.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{feedback.text}</p> : null}
  </section>;
}
