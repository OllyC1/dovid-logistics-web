"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Vehicle = { id: string; code: string; operational_status: string; assigned_rider_id: string | null; safety_status: string };
type Rider = { id: string; full_name: string | null };
type RunStop = { id: string; stop_type: string; sequence: number; status: string; address: string };
type Run = { id: string; run_reference: string; status: string; rider_id: string; vehicle_id: string; route_distance_meters: number | null; route_duration_seconds: number | null; expected_completion_at: string | null; total_revenue_kobo: number; estimated_profit_kobo: number | null; run_assignments: Array<{ id: string; status: string }>; delivery_run_stops: RunStop[] };
type Order = { id: string; order_reference: string; pickup_address: string; delivery_address: string };
type Expense = { id: string; category: string; amount_kobo: number; description: string; status: string; order_id: string };
type Attempt = { id: string; order_id: string; attempt_number: number; status: string; failure_reason: string | null; created_at: string };

export function RunOperationsConsole({ vehicles, riders, runs, orders, expenses, attempts }: { vehicles: Vehicle[]; riders: Rider[]; runs: Run[]; orders: Order[]; expenses: Expense[]; attempts: Attempt[] }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function createRun(form: FormData) {
    setPending(true); setMessage("");
    const response = await fetch("/api/admin/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: form.get("vehicleId"), riderId: form.get("riderId"), complianceReason: form.get("complianceReason"), idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending(false); setMessage(response.ok ? "Delivery run created." : body.error); if (response.ok) window.location.reload();
  }
  async function assign(runId: string, form: FormData) {
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/runs/${runId}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: form.get("orderId"), overrideReason: form.get("overrideReason") || undefined, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending(false); setMessage(response.ok ? "Order added after provider route and capacity checks." : body.error); if (response.ok) window.location.reload();
  }
  async function reviewExpense(expenseId: string, status: "approved" | "rejected" | "disputed", billable = false) {
    const reason = window.prompt("Record the review reason:"); if (!reason) return;
    setPending(true); setMessage("");
    const expense = expenses.find((item) => item.id === expenseId)!;
    const response = await fetch(`/api/admin/expenses/${expenseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason, customerBillable: billable, proposedAmountKobo: billable ? expense.amount_kobo : undefined, surchargeIdempotencyKey: billable ? crypto.randomUUID() : undefined }) });
    const body = await response.json(); setPending(false); setMessage(response.ok ? billable ? "Expense approved; separate customer charge proposed for authorization." : `Expense ${status}. No customer charge created.` : body.error); if (response.ok) window.location.reload();
  }
  async function resolveAttempt(attemptId: string, resolution: "retry_immediately" | "schedule_redelivery" | "return_to_sender" | "open_incident") {
    const reason = window.prompt("Record the operational resolution reason:"); if (!reason) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/attempts/${attemptId}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolution, attributableTo: resolution === "schedule_redelivery" ? "under_review" : "under_review", reason, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending(false); setMessage(response.ok ? `Attempt resolved as ${resolution.replaceAll("_", " ")}. No automatic customer charge was created.` : body.error); if (response.ok) window.location.reload();
  }
  async function moveStop(run: Run, stopId: string, direction: -1 | 1) {
    const stops = [...run.delivery_run_stops].filter((stop) => ["pending","next"].includes(stop.status)).sort((left, right) => left.sequence - right.sequence);
    const index = stops.findIndex((stop) => stop.id === stopId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= stops.length) return;
    [stops[index], stops[target]] = [stops[target], stops[index]];
    const reason = window.prompt("Why is the suggested route being changed?"); if (!reason) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/runs/${run.id}/route`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stopIds: stops.map((stop) => stop.id), reason, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setPending(false); setMessage(response.ok ? "Route order adjusted and audited. Recheck provider feasibility before dispatch." : body.error); if (response.ok) window.location.reload();
  }
  return <div className="grid gap-8">
    <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-extrabold text-navy">Create a compliant delivery run</h2><form action={createRun} className="mt-5 grid gap-3 sm:grid-cols-2"><select required name="vehicleId" className="rounded-xl border p-3"><option value="">Choose bike</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} · {vehicle.operational_status} · {vehicle.safety_status}</option>)}</select><select required name="riderId" className="rounded-xl border p-3"><option value="">Choose rider</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.full_name || rider.id}</option>)}</select><input required minLength={8} name="complianceReason" placeholder="Confirm motorcycle restrictions, rider hours and safety" className="rounded-xl border p-3 sm:col-span-2"/><Button disabled={pending} type="submit" className="sm:col-span-2">Create planned run</Button></form></section>
    <section><h2 className="text-xl font-extrabold text-navy">Rider delivery runs</h2><div className="mt-4 grid gap-4">{runs.map((run) => <article key={run.id} className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xl font-extrabold text-navy">{run.run_reference}</p><p className="mt-1 text-sm capitalize text-slate">{run.status} · {run.run_assignments.length} parcel assignments</p></div><div className="text-right text-sm text-slate"><p>{run.route_distance_meters ? `${(run.route_distance_meters / 1000).toFixed(1)} km` : "Route pending"}</p><p>Revenue snapshot: ₦{(run.total_revenue_kobo / 100).toLocaleString("en-NG")}</p></div></div>{run.delivery_run_stops.length ? <ol className="mt-5 grid gap-2">{[...run.delivery_run_stops].sort((left,right) => left.sequence-right.sequence).map((stop) => <li key={stop.id} className="flex items-center gap-2 rounded-2xl bg-cloud p-3"><span className="w-6 font-bold text-orange">{stop.sequence}</span><span className="min-w-0 flex-1 text-sm capitalize text-navy">{stop.stop_type} · {stop.address}</span><Button variant="ghost" disabled={pending} onClick={() => moveStop(run, stop.id, -1)}>↑</Button><Button variant="ghost" disabled={pending} onClick={() => moveStop(run, stop.id, 1)}>↓</Button></li>)}</ol> : null}<form action={(form) => assign(run.id, form)} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><select required name="orderId" className="rounded-xl border p-3"><option value="">Add unassigned order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_reference} · {order.pickup_address}</option>)}</select><input name="overrideReason" placeholder="Reason if overriding a conflict" className="rounded-xl border p-3"/><Button disabled={pending || !orders.length} type="submit">Evaluate and add</Button></form></article>)}{!runs.length ? <p className="rounded-3xl bg-white p-6 text-slate">No active delivery runs. Bikes remain offline until explicitly approved.</p> : null}</div></section>
    <section><h2 className="text-xl font-extrabold text-navy">Additional expense review</h2><div className="mt-4 grid gap-3">{expenses.map((expense) => <article key={expense.id} className="rounded-3xl bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold capitalize text-navy">{expense.category.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate">{expense.description}</p></div><p className="font-extrabold text-orange">₦{(expense.amount_kobo / 100).toLocaleString("en-NG")}</p></div><div className="mt-4 flex flex-wrap gap-2"><Button disabled={pending} variant="outline" onClick={() => reviewExpense(expense.id, "approved", false)}>Approve company expense</Button><Button disabled={pending} onClick={() => reviewExpense(expense.id, "approved", true)}>Propose customer charge</Button><Button disabled={pending} variant="ghost" onClick={() => reviewExpense(expense.id, "rejected")}>Reject</Button></div></article>)}{!expenses.length ? <p className="rounded-3xl bg-white p-6 text-slate">No expenses awaiting review.</p> : null}</div></section>
    <section><h2 className="text-xl font-extrabold text-navy">Missed-delivery exceptions</h2><div className="mt-4 grid gap-3">{attempts.map((attempt) => <article key={attempt.id} className="rounded-3xl bg-white p-5"><p className="font-bold capitalize text-navy">Attempt {attempt.attempt_number} · {attempt.status.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate">{attempt.failure_reason || "No reason recorded"}</p><p className="mt-2 text-xs text-slate">Order {attempt.order_id} · {new Date(attempt.created_at).toLocaleString("en-NG")}</p><div className="mt-4 flex flex-wrap gap-2"><Button disabled={pending} variant="outline" onClick={() => resolveAttempt(attempt.id, "retry_immediately")}>Retry now</Button><Button disabled={pending} variant="outline" onClick={() => resolveAttempt(attempt.id, "schedule_redelivery")}>Plan redelivery</Button><Button disabled={pending} variant="ghost" onClick={() => resolveAttempt(attempt.id, "return_to_sender")}>Return to sender</Button><Button disabled={pending} variant="ghost" onClick={() => resolveAttempt(attempt.id, "open_incident")}>Open incident</Button></div></article>)}{!attempts.length ? <p className="rounded-3xl bg-white p-6 text-slate">No unresolved delivery attempts.</p> : null}</div></section>
    {message ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}
  </div>;
}

