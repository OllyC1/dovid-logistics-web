"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { AttemptResolutionCard, type AttemptForReview, type AttemptResolutionInput } from "@/components/admin/attempt-resolution-card";

type Vehicle = { id: string; code: string; registration_number: string | null; operational_status: string; assigned_rider_id: string | null; safety_status: string };
type Rider = { id: string; full_name: string | null };
type RunStop = { id: string; stop_type: string; sequence: number; status: string; address: string };
type Run = { id: string; run_reference: string; status: string; rider_id: string; vehicle_id: string; route_distance_meters: number | null; route_duration_seconds: number | null; expected_completion_at: string | null; total_revenue_kobo: number; estimated_profit_kobo: number | null; run_assignments: Array<{ id: string; status: string }>; delivery_run_stops: RunStop[] };
type Order = { id: string; order_reference: string; pickup_address: string; delivery_address: string };
type Expense = { id: string; category: string; amount_kobo: number; description: string; status: string; order_id: string };
type ReasonAction = { title: string; description: string; confirmLabel: string; run: (reason: string) => Promise<void> };

export function RunOperationsConsole({ vehicles, riders, runs, orders, expenses, attempts }: { vehicles: Vehicle[]; riders: Rider[]; runs: Run[]; orders: Order[]; expenses: Expense[]; attempts: AttemptForReview[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const canCreateRun = Boolean(selectedVehicle && selectedVehicle.registration_number && selectedVehicle.operational_status === "available" && selectedVehicle.safety_status === "cleared" && selectedVehicle.assigned_rider_id === selectedRiderId);

  async function post(url: string, body: object, success: string) {
    setPending(true); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      setReasonAction(null);
      setMessage(response.ok ? success : result.error ?? "The operation could not be completed.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("We could not reach operations. Check your connection and try again.");
    } finally {
      setPending(false);
    }
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
    try {
      const response = await fetch(`/api/admin/expenses/${expenseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason, customerBillable: billable, proposedAmountKobo: billable ? expense.amount_kobo : undefined, surchargeIdempotencyKey: billable ? crypto.randomUUID() : undefined }) });
      const result = await response.json().catch(() => ({}));
      setReasonAction(null);
      setMessage(response.ok ? billable ? "Expense approved; separate customer charge proposed for authorization." : `Expense ${status}. No customer charge created.` : result.error ?? "The expense review could not be completed.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("We could not reach operations. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function resolveAttempt(attemptId: string, input: AttemptResolutionInput) {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/attempts/${attemptId}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, idempotencyKey: crypto.randomUUID() }) });
      const result = await response.json().catch(() => ({})) as { error?: string; customerApprovalRequired?: boolean };
      setMessage(response.ok
        ? result.customerApprovalRequired
          ? "Resolution saved. Any customer fee still needs separate approval and verified payment; no charge was created automatically."
          : "Resolution saved and audited. No customer charge was created automatically."
        : result.error ?? "The delivery attempt could not be resolved.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("We could not reach operations. Check your connection and try again.");
    } finally {
      setPending(false);
    }
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
    try {
      const response = await fetch(`/api/admin/runs/${runId}/route`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stopIds, reason, idempotencyKey: crypto.randomUUID() }) });
      const result = await response.json().catch(() => ({}));
      setReasonAction(null);
      setMessage(response.ok ? "Route order adjusted and audited. Recheck provider feasibility before dispatch." : result.error ?? "The route order could not be saved.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("We could not reach operations. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return <div className="grid gap-8">
    <details className="group rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-xl font-extrabold text-navy"><span>Create a compliant delivery run</span><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary>
      <form action={createRun} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Bike<select required name="vehicleId" value={selectedVehicleId} onChange={(event) => { const vehicle = vehicles.find((item) => item.id === event.target.value); setSelectedVehicleId(event.target.value); setSelectedRiderId(vehicle?.assigned_rider_id ?? ""); }} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="">Choose an available bike</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id} disabled={!vehicle.registration_number || vehicle.operational_status !== "available" || vehicle.safety_status !== "cleared" || !vehicle.assigned_rider_id}>{vehicle.registration_number || "Plate missing"} · {vehicle.code} · {vehicle.operational_status} · {vehicle.safety_status}</option>)}</select></label>
        <label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Rider<select required name="riderId" value={selectedRiderId} onChange={(event) => setSelectedRiderId(event.target.value)} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="">Choose the bike&apos;s assigned rider</option>{riders.map((rider) => <option key={rider.id} value={rider.id} disabled={Boolean(selectedVehicle?.assigned_rider_id && selectedVehicle.assigned_rider_id !== rider.id)}>{rider.full_name}</option>)}</select></label>
        <label className="grid min-w-0 gap-2 text-sm font-bold text-navy sm:col-span-2">Safety and compliance confirmation<input required minLength={8} name="complianceReason" placeholder="Confirm motorcycle restrictions, rider hours and safety" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label>
        <Button disabled={pending || !canCreateRun} type="submit" className="w-full sm:col-span-2">Create planned run</Button>
        {!vehicles.some((vehicle) => vehicle.registration_number && vehicle.operational_status === "available" && vehicle.safety_status === "cleared" && vehicle.assigned_rider_id) ? <p className="rounded-2xl bg-cloud p-4 text-sm leading-6 text-slate sm:col-span-2">No bike is ready for a run. Register its plate, assign an active rider, verify capacity and safety, then make it available in Fleet and dispatch.</p> : null}
      </form>
    </details>
    <section>
      <h2 className="text-xl font-extrabold text-navy">Rider delivery runs</h2>
      <div className="mt-4 grid gap-4">{runs.map((run) => <article key={run.id} className="min-w-0 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xl font-extrabold text-navy">{run.run_reference}</p><p className="mt-1 text-sm capitalize text-slate">{run.status} · {run.run_assignments.length} parcel assignments</p></div><div className="text-right text-sm text-slate"><p>{run.route_distance_meters ? `${(run.route_distance_meters / 1000).toFixed(1)} km` : "Route pending"}</p><p>Revenue snapshot: ₦{(run.total_revenue_kobo / 100).toLocaleString("en-NG")}</p></div></div>
        {run.delivery_run_stops.length ? <ol className="mt-5 grid gap-2">{[...run.delivery_run_stops].sort((left, right) => left.sequence - right.sequence).map((stop) => <li key={stop.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-2xl bg-cloud p-3"><span className="w-6 font-bold text-orange">{stop.sequence}</span><span className="min-w-0 break-words text-sm capitalize leading-6 text-navy">{stop.stop_type} · {stop.address}</span><div className="col-start-2 flex flex-wrap gap-2"><Button variant="ghost" disabled={pending} aria-label={`Move ${stop.address} earlier`} onClick={() => moveStop(run, stop.id, -1)}>Move up</Button><Button variant="ghost" disabled={pending} aria-label={`Move ${stop.address} later`} onClick={() => moveStop(run, stop.id, 1)}>Move down</Button></div></li>)}</ol> : null}
        <form action={(form) => assign(run.id, form)} className="mt-5 grid min-w-0 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Order to add<select required name="orderId" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="">Choose an unassigned order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_reference} · {order.pickup_address}</option>)}</select></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Override reason (only if needed)<input name="overrideReason" placeholder="Explain any dispatch conflict" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label><Button className="w-full sm:w-auto" disabled={pending || !orders.length} type="submit">Evaluate and add</Button></form>
        <div className="mt-4 flex justify-end"><Button className="w-full sm:w-auto" disabled={pending} variant="outline" onClick={() => setReasonAction({ title: "Complete this delivery run?", description: "Confirm that every parcel, payment and custody record has been checked before the run is closed.", confirmLabel: "Complete run", run: (reason) => completeRun(run.id, reason) })}>Complete audited run</Button></div>
      </article>)}{!runs.length ? <p className="rounded-3xl bg-white p-6 text-slate">No active delivery runs. Bikes remain offline until explicitly approved.</p> : null}</div>
    </section>
    <section><h2 className="text-xl font-extrabold text-navy">Additional expense review</h2><div className="mt-4 grid gap-3">{expenses.map((expense) => <article key={expense.id} className="rounded-3xl bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold capitalize text-navy">{expense.category.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate">{expense.description}</p></div><p className="font-extrabold text-orange">₦{(expense.amount_kobo / 100).toLocaleString("en-NG")}</p></div><div className="mt-4 grid gap-2 sm:flex sm:flex-wrap"><Button disabled={pending} variant="outline" onClick={() => setReasonAction({ title: "Approve this company expense?", description: "The expense will be recorded against operations and will not create a customer charge.", confirmLabel: "Approve expense", run: (reason) => reviewExpense(expense.id, "approved", false, reason) })}>Approve company expense</Button><Button disabled={pending} onClick={() => setReasonAction({ title: "Propose this customer charge?", description: "Approval creates a separate charge proposal. The customer must authorize and pay it before any mandatory handover.", confirmLabel: "Propose charge", run: (reason) => reviewExpense(expense.id, "approved", true, reason) })}>Propose customer charge</Button><Button disabled={pending} variant="ghost" onClick={() => setReasonAction({ title: "Reject this expense?", description: "Record why this submitted operating expense is being rejected.", confirmLabel: "Reject expense", run: (reason) => reviewExpense(expense.id, "rejected", false, reason) })}>Reject</Button></div></article>)}{!expenses.length ? <p className="rounded-3xl bg-white p-6 text-slate">No expenses awaiting review.</p> : null}</div></section>
    <section><h2 className="text-xl font-extrabold text-navy">Missed-delivery exceptions</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate">Open one attempt at a time, verify what happened and choose the audited next step. Customers are never charged from this screen.</p><div className="mt-4 grid gap-3">{attempts.map((attempt) => <AttemptResolutionCard key={attempt.id} attempt={attempt} pending={pending} onResolve={resolveAttempt} />)}{!attempts.length ? <p className="rounded-3xl bg-white p-6 text-slate">No unresolved delivery attempts.</p> : null}</div></section>
    <ActionFeedback feedback={message ? { text: message, ok: !/could not|failed|required|invalid|not found|conflict/i.test(message) } : null} pending={pending} pendingText="Updating delivery operations…" onDismiss={() => setMessage("")} />
    <ReasonDialog open={Boolean(reasonAction)} title={reasonAction?.title ?? "Record a reason"} description={reasonAction?.description ?? "This action must remain auditable."} confirmLabel={reasonAction?.confirmLabel ?? "Continue"} pending={pending} onCancel={() => setReasonAction(null)} onConfirm={(reason) => reasonAction?.run(reason)} />
  </div>;
}
