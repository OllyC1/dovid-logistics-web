"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DeliveryOperationsForms({ orderId, runId }: { orderId: string; runId?: string | null }) {
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [waitingId, setWaitingId] = useState("");
  async function reportExpense(form: FormData) {
    setPending("expense"); setMessage("");
    const response = await fetch("/api/rider/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, runId: runId ?? null, category: form.get("category"), amountKobo: Number(form.get("amountKobo")), description: form.get("description"), occurredAt: new Date().toISOString(), alreadyIncurred: form.get("alreadyIncurred") === "on", customerApprovalObtained: false, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending(""); setMessage(response.ok ? "Expense submitted for review. The customer was not charged." : body.error);
  }
  async function reportAttempt(form: FormData) {
    setPending("attempt"); setMessage("");
    const status = String(form.get("status"));
    const response = await fetch("/api/rider/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, runId: runId ?? null, status, contactAttempts: [], waitingDurationSeconds: Number(form.get("waitingSeconds") || 0), failureReason: form.get("reason"), evidence: {}, riderNotes: form.get("notes") || undefined, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending(""); setMessage(response.ok ? "Delivery attempt recorded. Dispatch will choose the resolution." : body.error);
  }
  async function startWaiting() {
    setPending("waiting"); setMessage("");
    const response = await fetch("/api/rider/waiting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, runId: runId ?? null, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending("");
    if (!response.ok) return setMessage(body.error);
    setWaitingId(body.id); setMessage("Waiting timer started by the server.");
  }
  async function stopWaiting() {
    setPending("waiting"); setMessage("");
    const response = await fetch(`/api/rider/waiting/${waitingId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excludedSeconds: 0, expenseIdempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending("");
    if (!response.ok) return setMessage(body.error);
    setWaitingId(""); setMessage(body.chargeKobo === null ? "Waiting recorded. Pricing needs administrator configuration." : `Waiting recorded. Proposed calculation: ₦${(body.chargeKobo / 100).toFixed(2)}; customer not charged.`);
  }
  return <section className="mt-5 grid gap-5 lg:grid-cols-2"><form action={reportExpense} className="rounded-3xl bg-white p-6"><h3 className="font-extrabold text-navy">Report an operating expense</h3><select name="category" className="mt-4 w-full rounded-xl border p-3"><option value="toll_road_access">Toll / road access</option><option value="authorized_parking_access">Authorized parking / access</option><option value="extra_stop">Extra stop</option><option value="address_correction">Address correction</option><option value="return_journey">Return journey</option><option value="redelivery">Redelivery</option><option value="other">Other</option></select><input required name="amountKobo" type="number" min={1} placeholder="Amount in kobo" className="mt-3 w-full rounded-xl border p-3"/><textarea required minLength={5} name="description" placeholder="What happened?" className="mt-3 min-h-24 w-full rounded-xl border p-3"/><label className="mt-3 flex gap-2 text-sm text-slate"><input name="alreadyIncurred" type="checkbox"/>Cost already incurred</label><Button className="mt-4" disabled={Boolean(pending)} type="submit">Submit for review</Button></form><form action={reportAttempt} className="rounded-3xl bg-white p-6"><h3 className="font-extrabold text-navy">Report a failed or missed attempt</h3><select name="status" className="mt-4 w-full rounded-xl border p-3"><option value="recipient_unavailable">Recipient unavailable</option><option value="address_problem">Address problem</option><option value="recipient_refused">Recipient refused</option><option value="payment_refused">Receiver refused payment</option><option value="access_blocked">Access blocked</option><option value="unsafe_delivery">Unsafe delivery area</option><option value="incident_escalated">Escalate an incident</option></select><input required minLength={3} name="reason" placeholder="Reason" className="mt-3 w-full rounded-xl border p-3"/><input name="waitingSeconds" type="number" min={0} placeholder="Waiting time in seconds" className="mt-3 w-full rounded-xl border p-3"/><textarea name="notes" placeholder="Private notes for dispatch" className="mt-3 min-h-20 w-full rounded-xl border p-3"/><Button className="mt-4" variant="outline" disabled={Boolean(pending)} type="submit">Record attempt safely</Button></form><div className="rounded-3xl bg-white p-6 lg:col-span-2"><h3 className="font-extrabold text-navy">Recipient waiting timer</h3><p className="mt-2 text-sm text-slate">The server records arrival and calculates any proposal. It never bills the customer automatically.</p><Button className="mt-4" disabled={Boolean(pending)} onClick={waitingId ? stopWaiting : startWaiting}>{waitingId ? "Stop waiting timer" : "Start waiting timer"}</Button></div>{message ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 lg:col-span-2">{message}</p> : null}</section>;
}

