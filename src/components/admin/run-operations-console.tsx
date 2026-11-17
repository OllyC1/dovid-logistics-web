"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/ui/reason-dialog";

type Vehicle = { id: string; code: string; operational_status: string; assigned_rider_id: string | null; safety_status: string };
type Rider = { id: string; full_name: string | null };
type RunStop = { id: string; stop_type: string; sequence: number; status: string; address: string };
type Run = { id: string; run_reference: string; status: string; rider_id: string; vehicle_id: string; route_distance_meters: number | null; route_duration_seconds: number | null; expected_completion_at: string | null; total_revenue_kobo: number; estimated_profit_kobo: number | null; run_assignments: Array<{ id: string; status: string }>; delivery_run_stops: RunStop[] };
type Order = { id: string; order_reference: string; pickup_address: string; delivery_address: string };
type Expense = { id: string; category: string; amount_kobo: number; description: string; status: string; order_id: string };
type Attempt = { id: string; order_id: string; attempt_number: number; status: string; failure_reason: string | null; created_at: string };
type ReasonAction = { title: string; description: string; confirmLabel: string; run: (reason: string) => Promise<void> };

export function RunOperationsConsole({ vehicles, riders, runs, orders, expenses, attempts }: { vehicles: Vehicle[]; riders: Rider[]; runs: Run[]; orders: Order[]; expenses: Expense[]; attempts: Attempt[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);

  async function post(url: string, body: object, success: string) {
    setPending(true); setMessage("");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); setPending(false); setReasonAction(null); setMessage(response.ok ? success : result.error); if (response.ok) router.refresh();
  }

  async function createRun(form: FormData) {
    await post("/api/admin/runs", { vehicleId: form.get("vehicleId"), riderId: form.get("riderId"), complianceReason: form.get("complianceReason"), idempotencyKey: crypto.randomUUID() }, "Delivery run created.");
  }

  async function assign(runId: string, form: FormData) {
    await post(`/api/admin/runs/${runId}/assign`, { orderId: form.get("orderId"), overrideReason: form.get("overrideReason") || undefined, idempotencyKey: crypto.randomUUID() }, "Order added after provider route and capacity checks.");
  }

  async function completeRun(runId: string, reason: string) {
    await post(`/api/admin/runs/${runId}/complete`, { reason, idempotencyKey: crypto.randomUUID() }, "Delivery run completed and audited.");
  }

  async function reviewExpense(expenseId: string, status: "approved" | "rejected" | "disputed", billable: boolean, reason: string) {
    setPending(true); setMessage("");
    const expense = expenses.find((item) => item.id === expenseId)!;
    const response = await fetch(`/api/admin/expenses/${expenseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason, customerBillable: billable, proposedAmountKobo: billable ? expense.amount_kobo : undefined, surchargeIdempotencyKey: billable ? crypto.randomUUID() : undefined }) });
    const result = await response.json(); setPending(false); setReasonAction(null); setMessage(response.ok ? billable ? "Expense approved; separate customer charge proposed for authorization." : `Expense ${status}. No customer charge created.` : result.error); if (response.ok) router.refresh();
  }

  async function resolveAttempt(attemptId: string, resolution: "retry_immediately" | "schedule_redelivery" | "return_to_sender" | "open_incident", reason: string) {
    await post(`/api/admin/attempts/${attemptId}/resolve`, { resolution, attributableTo: "under_review", reason, idempotencyKey: crypto.randomUUID() }, `Attempt resolved as ${resolution.replaceAll("_", " ")}. No automatic customer charge was created.`);
  }

  async function moveStop(run: Run, stopId: string, direction: -1 | 1) {
    const stops = [...run.delivery_run_stops].filter((stop) => ["pending", "next"].includes(stop.status)).sort((left, right) => left.sequence - right.sequence);
    const index = stops.findIndex((stop) => stop.id === stopId); const target = index + direction;
    if (index < 0 || target < 0 || target >= stops.length) return;
    [stops[index], stops[target]] = [stops[target], stops[index]];
    setReasonAction({
      title: "Change the suggested stop order?",
      description: "Record why the provider route is being overridden. The revised route will be audited and must still pass feasibility checks.",
      confirmLabel: "Save stop order",
      run: (reason) => saveStopOrder(run.id, stops.map((stop) => stop.id), reason),
    });
  }

  async function saveStopOrder(runId: string, stopIds: string[], reason: string) {
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/runs/${runId}/route`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stopIds, reason, idempotencyKey: crypto.randomUUID() }) });
    const result = await response.json(); setPending(false); setReasonAction(null); setMessage(response.ok ? "Route order adjusted and audited. Recheck provider feasibility before dispatch." : result.error); if (response.ok) router.refresh();
  }

  return <div className="grid gap-8">
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-extrabold text-navy">Create a compliant delivery run</h2>
      <form action={createRun} className="mt-5 grid gap-3 sm:grid-cols-2">
        <select required name="vehicleId" className="rounded-xl border p-3"><option value="">Choose bike</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} · {vehicle.operational_status} · {vehicle.safety_status}</option>)}</select>
        <select required name="riderId" className="rounded-xl border p-3"><option value="">Choose rider</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.full_name || rider.id}</option>)}</select>
        <input required minLength={8} name="complianceReason" placeholder="Confirm motorcycle restrictions, rider hours and safety" className="rounded-xl border p-3 sm:col-span-2" />
        <Button disabled={pending} type="submit" className="sm:col-span-2">Create planned run</Button>
      </form>
    </section>
    <section>
      <h2 className="text-xl font-extrabold text-navy">Rider delivery runs</h2>
      <div className="mt-4 grid gap-4">{runs.map((run) => <article key={run.id} className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xl font-extrabold text-navy">{run.run_reference}</p><p className="mt-1 text-sm capitalize text-slate">{run.status} · {run.run_assignments.length} parcel assignments</p></div><div className="text-right text-sm text-slate"><p>{run.route_distance_meters ? `${(run.route_distance_meters / 1000).toFixed(1)} km` : "Route pending"}</p><p>Revenue snapshot: ₦{(run.total_revenue_kobo / 100).toLocaleString("en-NG")}</p></div></div>
        {run.delivery_run_stops.length ? <ol className="mt-5 grid gap-2">{[...run.delivery_run_stops].sort((left, right) => left.sequence - right.sequence).map((stop) => <li key={stop.id} className="flex items-center gap-2 rounded-2xl bg-cloud p-3"><span className="w-6 font-bold text-orange">{stop.sequence}</span><span className="min-w-0 flex-1 text-sm capitalize text-navy">{stop.stop_type} · {stop.address}</span><Button variant="ghost" disabled={pending} onClick={() => moveStop(run, stop.id, -1)}>↑</Button><Button variant="ghost" disabled={pending} onClick={() => moveStop(run, stop.id, 1)}>↓</Button></li>)}</ol> : null}
        <form action={(form) => assign(run.id, form)} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><select required name="orderId" className="rounded-xl border p-3"><option value="">Add unassigned order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_reference} · {order.pickup_address}</option>)}</select><input name="overrideReason" placeholder="Reason if overriding a conflict" className="rounded-xl border p-3" /><Button disabled={pending || !orders.length} type="submit">Evaluate and add</Button></form>
        <div className="mt-4 flex justify-end"><Button disabled={pending} variant="outline" onClick={() => setReasonAction({ title: "Complete this delivery run?", description: "Confirm that every parcel, payment and custody record has been checked before the run is closed.", confirmLabel: "Complete run", run: (reason) => completeRun(run.id, reason) })}>Complete audited run</Button></div>
      </article>)}{!runs.length ? <p className="rounded-3xl bg-white p-6 text-slate">No active delivery runs. Bikes remain offline until explicitly approved.</p> : null}</div>
    </section>
    <section><h2 className="text-xl font-extrabold text-navy">Additional expense review</h2><div className="mt-4 grid gap-3">{expenses.map((expense) => <article key={expense.id} className="rounded-3xl bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold capitalize text-navy">{expense.category.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate">{expense.description}</p></div><p className="font-extrabold text-orange">₦{(expense.amount_kobo / 100).toLocaleString("en-NG")}</p></div><div className="mt-4 grid gap-2 sm:flex sm:flex-wrap"><Button disabled={pending} variant="outline" onClick={() => setReasonAction({ title: "Approve this company expense?", description: "The expense will be recorded against operations and will not create a customer charge.", confirmLabel: "Approve expense", run: (reason) => reviewExpense(expense.id, "approved", false, reason) })}>Approve company expense</Button><Button disabled={pending} onClick={() => setReasonAction({ title: "Propose this customer charge?", description: "Approval creates a separate charge proposal. The customer must authorize and pay it before any mandatory handover.", confirmLabel: "Propose charge", run: (reason) => reviewExpense(expense.id, "approved", true, reason) })}>Propose customer charge</Button><Button disabled={pending} variant="ghost" onClick={() => setReasonAction({ title: "Reject this expense?", description: "Record why this submitted operating expense is being rejected.", confirmLabel: "Reject expense", run: (reason) => reviewExpense(expense.id, "rejected", false, reason) })}>Reject</Button></div></article>)}{!expenses.length ? <p className="rounded-3xl bg-white p-6 text-slate">No expenses awaiting review.</p> : null}</div></section>
    <section><h2 className="text-xl font-extrabold text-navy">Missed-delivery exceptions</h2><div className="mt-4 grid gap-3">{attempts.map((attempt) => <article key={attempt.id} className="rounded-3xl bg-white p-5"><p className="font-bold capitalize text-navy">Attempt {attempt.attempt_number} · {attempt.status.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate">{attempt.failure_reason || "No reason recorded"}</p><p className="mt-2 break-all text-xs text-slate">Order {attempt.order_id} · {new Date(attempt.created_at).toLocaleString("en-NG")}</p><div className="mt-4 grid gap-2 sm:flex sm:flex-wrap"><Button disabled={pending} variant="outline" onClick={() => setReasonAction({ title: "Retry this delivery now?", description: "Record why an immediate retry is operationally safe and appropriate.", confirmLabel: "Retry delivery", run: (reason) => resolveAttempt(attempt.id, "retry_immediately", reason) })}>Retry now</Button><Button disabled={pending} variant="outline" onClick={() => setReasonAction({ title: "Plan a redelivery?", description: "Record the reason and confirm that dispatch will schedule a new attempt. No customer charge is created automatically.", confirmLabel: "Plan redelivery", run: (reason) => resolveAttempt(attempt.id, "schedule_redelivery", reason) })}>Plan redelivery</Button><Button disabled={pending} variant="ghost" onClick={() => setReasonAction({ title: "Return this parcel to the sender?", description: "Record why return-to-sender is the correct custody-safe resolution.", confirmLabel: "Return to sender", run: (reason) => resolveAttempt(attempt.id, "return_to_sender", reason) })}>Return to sender</Button><Button disabled={pending} variant="ghost" onClick={() => setReasonAction({ title: "Open an operational incident?", description: "Record why this attempt requires formal investigation and follow-up.", confirmLabel: "Open incident", run: (reason) => resolveAttempt(attempt.id, "open_incident", reason) })}>Open incident</Button></div></article>)}{!attempts.length ? <p className="rounded-3xl bg-white p-6 text-slate">No unresolved delivery attempts.</p> : null}</div></section>
    {message ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}
    <ReasonDialog open={Boolean(reasonAction)} title={reasonAction?.title ?? "Record a reason"} description={reasonAction?.description ?? "This action must remain auditable."} confirmLabel={reasonAction?.confirmLabel ?? "Continue"} pending={pending} onCancel={() => setReasonAction(null)} onConfirm={(reason) => reasonAction?.run(reason)} />
  </div>;
}
