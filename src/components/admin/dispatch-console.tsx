"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { isRealVehicleRegistration } from "@/features/fleet/registration";

type Rider = { id: string; full_name: string | null };
type Vehicle = { id: string; code: string; registration_number: string | null; manufacturer: string | null; model: string | null; model_year: number | null; operational_status: string; safety_status: string; assigned_rider_id: string | null; home_territory_codes: string[]; max_active_assignments: number; max_payload_weight_grams: number | null; cargo_length_mm: number | null; cargo_width_mm: number | null; cargo_height_mm: number | null; capacity_verified_at: string | null };
type Request = { id: string; reference_code: string; decision: string; reason_code: string; road_distance_meters: number | null; created_at: string; request_payload: Record<string, unknown> };
type Order = { id: string; order_reference: string; pickup_address: string; delivery_address: string; pickup_zone_id: string | null };

const territoryOptions = [
  ["A", "Northeast"], ["B", "North / Central"], ["C", "City centre"],
  ["D", "South"], ["E", "West"], ["F", "Outskirts"],
] as const;

export function DispatchConsole({ vehicles, riders, missingRiderNames, requests, orders }: { vehicles: Vehicle[]; riders: Rider[]; missingRiderNames: number; requests: Request[]; orders: Order[] }) {
  const router = useRouter();
  const addBikeForm = useRef<HTMLFormElement>(null);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [decision, setDecision] = useState<{ id: string; status: "approved" | "rejected" } | null>(null);
  const [fleetSearch, setFleetSearch] = useState("");
  const [fleetStatus, setFleetStatus] = useState("all");
  const [fleetSafety, setFleetSafety] = useState("all");
  const [fleetYear, setFleetYear] = useState("all");
  const fleetYears = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.model_year).filter((year): year is number => Boolean(year)))].sort((a, b) => b - a), [vehicles]);
  const filteredVehicles = useMemo(() => {
    const search = fleetSearch.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      const searchable = [vehicle.code, vehicle.registration_number, vehicle.manufacturer, vehicle.model, vehicle.model_year].filter(Boolean).join(" ").toLowerCase();
      return (!search || searchable.includes(search)) && (fleetStatus === "all" || vehicle.operational_status === fleetStatus) && (fleetSafety === "all" || vehicle.safety_status === fleetSafety) && (fleetYear === "all" || String(vehicle.model_year) === fleetYear);
    });
  }, [fleetSafety, fleetSearch, fleetStatus, fleetYear, vehicles]);

  async function createVehicle(form: FormData) {
    setPending(true);
    setFeedback(null);
    try {
      const modelYear = String(form.get("modelYear") ?? "").trim();
      const response = await fetch("/api/admin/dispatch/fleet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationNumber: form.get("registrationNumber"), internalCode: String(form.get("internalCode") ?? "").trim() || undefined, manufacturer: form.get("manufacturer"), model: form.get("model"), modelYear: modelYear ? Number(modelYear) : null, homeTerritoryCodes: form.getAll("homeTerritoryCodes"), reason: form.get("reason") }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setFeedback({ text: body.error ?? "The bike could not be registered.", ok: false });
      addBikeForm.current?.reset();
      setFeedback({ text: `${body.vehicle.registrationNumber} was registered offline. Complete its safety and capacity checks before making it available.`, ok: true });
      router.refresh();
    } catch {
      setFeedback({ text: "We could not reach dispatch. Check your connection and try again.", ok: false });
    } finally {
      setPending(false);
    }
  }

  async function decide(id: string, status: "approved" | "rejected", reason: string) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/dispatch/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setFeedback({ text: body.error ?? "The availability request could not be updated.", ok: false });
      setDecision(null);
      const notification = body.notificationQueued ? " A continuation email was queued for the customer." : " No email was sent because no valid notification email was supplied.";
      setFeedback({ text: `Request ${status}. The customer can now ${status === "approved" ? "continue from the secure link or open page" : "see the recorded rejection"}; no order, rider assignment or charge was created by this action.${notification}`, ok: true });
      router.refresh();
    } catch {
      setFeedback({ text: "We could not reach dispatch. Check your connection and try again.", ok: false });
    } finally {
      setPending(false);
    }
  }

  async function updateVehicle(vehicle: Vehicle, form: FormData) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/dispatch/fleet/${vehicle.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationNumber: form.get("registrationNumber"), manufacturer: String(form.get("manufacturer") ?? "").trim() || null, model: String(form.get("model") ?? "").trim() || null, modelYear: form.get("modelYear") ? Number(form.get("modelYear")) : null, assignedRiderId: form.get("riderId") || null, operationalStatus: form.get("status"), safetyStatus: form.get("safetyStatus"), maxActiveAssignments: Number(form.get("maxActiveAssignments")), maxPayloadWeightGrams: form.get("maxPayloadWeightGrams") ? Number(form.get("maxPayloadWeightGrams")) : null, cargoLengthMm: form.get("cargoLengthMm") ? Number(form.get("cargoLengthMm")) : null, cargoWidthMm: form.get("cargoWidthMm") ? Number(form.get("cargoWidthMm")) : null, cargoHeightMm: form.get("cargoHeightMm") ? Number(form.get("cargoHeightMm")) : null, capacityVerified: form.get("capacityVerified") === "on", reason: form.get("reason") }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const activeOrders = (body.activeAssignments ?? []).map((assignment: { orderReference: string }) => assignment.orderReference).join(", ");
        const activeRuns = (body.activeRuns ?? []).map((run: { reference: string }) => run.reference).join(", ");
        const details = [activeOrders && `Order: ${activeOrders}`, activeRuns && `Run: ${activeRuns}`].filter(Boolean).join(" · ");
        return setFeedback({ text: [body.error ?? "The bike configuration could not be updated.", details].filter(Boolean).join(" "), ok: false });
      }
      setFeedback({ text: "Bike configuration updated and recorded.", ok: true });
      router.refresh();
    } catch {
      setFeedback({ text: "We could not reach dispatch. Check your connection and try again.", ok: false });
    } finally {
      setPending(false);
    }
  }

  async function assign(order: Order, form: FormData) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/dispatch/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, vehicleId: form.get("vehicleId"), riderId: form.get("riderId"), overrideReason: form.get("overrideReason") || undefined }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setFeedback({ text: body.error ?? "The assignment could not be completed.", ok: false });
      setFeedback({ text: `Assignment recorded with score ${body.score}.`, ok: true });
      router.refresh();
    } catch {
      setFeedback({ text: "We could not reach dispatch. Check your connection and try again.", ok: false });
    } finally {
      setPending(false);
    }
  }

  return <div className="grid gap-8">
    <section className="grid gap-4">
      <div>
        <h2 className="text-xl font-extrabold text-navy">Fleet registry</h2>
        <p className="mt-2 text-sm leading-6 text-slate">The plate number identifies the physical motorcycle. Every new bike starts offline and needs a separate safety and capacity review.</p>
      </div>
      <details className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
        <summary className="flex min-h-12 cursor-pointer items-center font-extrabold text-navy">Add a motorcycle</summary>
        <form ref={addBikeForm} action={createVehicle} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Plate / registration number<input required name="registrationNumber" autoCapitalize="characters" autoComplete="off" placeholder="e.g. ABC 123 XY" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal uppercase" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Internal bike name <span className="font-normal text-slate">(optional)</span><input name="internalCode" autoCapitalize="characters" autoComplete="off" placeholder="e.g. BIKE-03" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal uppercase" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Manufacturer<input required name="manufacturer" placeholder="e.g. Honda" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Model<input required name="model" placeholder="e.g. Ace 125" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Model year <span className="font-normal text-slate">(optional)</span><input name="modelYear" type="number" inputMode="numeric" min={1980} max={2100} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label>
          <fieldset className="grid min-w-0 gap-2 sm:col-span-2">
            <legend className="text-sm font-bold text-navy">Preferred territories <span className="font-normal text-slate">(optional)</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">{territoryOptions.map(([code, label]) => <label key={code} className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm text-navy"><input type="checkbox" name="homeTerritoryCodes" value={code} className="size-5 shrink-0" />Zone {code} · {label}</label>)}</div>
          </fieldset>
          <label className="grid min-w-0 gap-2 text-sm font-bold text-navy sm:col-span-2">Why is this bike being registered?<input required minLength={8} name="reason" placeholder="New company motorcycle received and documents checked" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label>
          <Button disabled={pending} type="submit" className="w-full sm:col-span-2">{pending ? "Registering motorcycle…" : "Register motorcycle offline"}</Button>
        </form>
      </details>
      {missingRiderNames > 0 ? <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{missingRiderNames} active rider {missingRiderNames === 1 ? "account is" : "accounts are"} hidden because a rider name has not been recorded. Add the name in Team Management before assigning a bike.</p> : null}
      <details className="group rounded-3xl bg-white p-4 shadow-sm sm:p-5" open><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-navy"><span>Search and filter motorcycles</span><span aria-hidden="true" className="text-orange transition group-open:rotate-45">+</span></summary><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2 lg:col-span-1">Plate, make or model<input value={fleetSearch} onChange={(event) => setFleetSearch(event.target.value)} type="search" placeholder="Search fleet" className="min-h-12 rounded-xl border p-3 font-normal" /></label><label className="grid gap-2 text-sm font-bold text-navy">Operating status<select value={fleetStatus} onChange={(event) => setFleetStatus(event.target.value)} className="min-h-12 rounded-xl border p-3 font-normal"><option value="all">All statuses</option><option value="offline">Offline</option><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="suspended">Suspended</option></select></label><label className="grid gap-2 text-sm font-bold text-navy">Safety review<select value={fleetSafety} onChange={(event) => setFleetSafety(event.target.value)} className="min-h-12 rounded-xl border p-3 font-normal"><option value="all">All safety states</option><option value="cleared">Cleared</option><option value="review_required">Review required</option><option value="blocked">Blocked</option></select></label><label className="grid gap-2 text-sm font-bold text-navy">Model year<select value={fleetYear} onChange={(event) => setFleetYear(event.target.value)} className="min-h-12 rounded-xl border p-3 font-normal"><option value="all">All years</option>{fleetYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate"><p>{filteredVehicles.length} of {vehicles.length} motorcycles shown</p><a href="/admin/team" className="inline-flex min-h-11 items-center font-bold text-orange">Invite or manage riders</a></div></details>
      <div className="grid gap-4 lg:grid-cols-2">{filteredVehicles.map((vehicle) => {
        const assignedRider = riders.find((rider) => rider.id === vehicle.assigned_rider_id);
        const hasRealRegistration = isRealVehicleRegistration(vehicle.registration_number);
        return <details key={vehicle.id} className="min-w-0 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
          <summary className="min-h-12 cursor-pointer list-none rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="text-xl font-extrabold text-navy">{vehicle.code}</p><p className="mt-1 break-words text-sm font-bold text-orange">{vehicle.registration_number || "Plate number not recorded"}</p></div><span className="shrink-0 rounded-full bg-cloud px-3 py-1 text-xs font-bold capitalize text-navy">{vehicle.operational_status}</span></div><p className="mt-3 break-words text-sm leading-6 text-slate">{[vehicle.manufacturer, vehicle.model, vehicle.model_year].filter(Boolean).join(" · ") || "Bike details not recorded"}</p><p className="mt-1 text-sm text-slate">Rider: <strong className="text-navy">{assignedRider?.full_name || "Not assigned"}</strong> · Safety: <strong className="capitalize text-navy">{vehicle.safety_status.replaceAll("_", " ")}</strong></p><p className="mt-3 text-sm font-bold text-orange">Review and edit</p></summary>
        <form action={(form) => updateVehicle(vehicle, form)} className="mt-5 grid min-w-0 gap-4 border-t border-navy/10 pt-5">
          {!hasRealRegistration ? <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">This is a temporary fleet record. Enter the motorcycle&apos;s real plate before assigning a rider or making it available.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Plate / registration number<input required name="registrationNumber" autoCapitalize="characters" autoComplete="off" defaultValue={vehicle.registration_number ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal uppercase" /></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Assigned rider<select name="riderId" defaultValue={vehicle.assigned_rider_id ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="">Not assigned</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.full_name}</option>)}</select></label></div>
          <div className="grid gap-3 sm:grid-cols-3"><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Manufacturer<input name="manufacturer" defaultValue={vehicle.manufacturer ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Model<input name="model" defaultValue={vehicle.model ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Model year<input name="modelYear" type="number" inputMode="numeric" min={1980} max={2100} defaultValue={vehicle.model_year ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal" /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Operating status<select name="status" defaultValue={vehicle.operational_status} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="offline">Offline</option><option value="available">Available for dispatch</option><option value="assigned">Assigned / carrying parcels</option><option value="maintenance">In maintenance</option><option value="suspended">Suspended</option></select></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Safety review<select name="safetyStatus" defaultValue={vehicle.safety_status} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="cleared">Cleared</option><option value="review_required">Review required</option><option value="blocked">Blocked</option></select></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Maximum parcels<input required name="maxActiveAssignments" type="number" inputMode="numeric" min={1} max={10} defaultValue={vehicle.max_active_assignments} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Maximum payload (grams)<input name="maxPayloadWeightGrams" type="number" inputMode="numeric" min={1} defaultValue={vehicle.max_payload_weight_grams ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label></div>
          <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 text-sm font-bold text-navy sm:col-span-3">Measured cargo space in millimetres</legend><label className="grid min-w-0 gap-2 text-sm font-semibold text-navy">Length<input name="cargoLengthMm" type="number" inputMode="numeric" min={1} defaultValue={vehicle.cargo_length_mm ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-semibold text-navy">Width<input name="cargoWidthMm" type="number" inputMode="numeric" min={1} defaultValue={vehicle.cargo_width_mm ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-semibold text-navy">Height<input name="cargoHeightMm" type="number" inputMode="numeric" min={1} defaultValue={vehicle.cargo_height_mm ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label></fieldset>
          <label className="flex min-h-12 items-start gap-3 rounded-xl border p-3 text-sm font-bold leading-6 text-navy"><input name="capacityVerified" type="checkbox" defaultChecked={Boolean(vehicle.capacity_verified_at)} className="mt-1 size-5 shrink-0"/>I physically measured and verified this capacity</label>
          <p className="rounded-2xl bg-cloud p-4 text-sm leading-6 text-slate">A bike can become available only after its real plate, active rider, safety clearance, payload and cargo measurements are recorded. “Assigned” is managed automatically while the bike has parcels; it may continue receiving work until the verified parcel limit is reached.</p>
          <label className="grid gap-2 text-sm font-bold text-navy">Reason and verification evidence<input required minLength={8} name="reason" placeholder="What changed, who checked it, and why" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label>
          <Button disabled={pending} type="submit">{pending ? "Saving bike record…" : "Save bike record"}</Button>
        </form></details>;
      })}</div>
      {!vehicles.length ? <p className="rounded-3xl bg-white p-6 text-slate">No motorcycles are registered yet. Add the first bike above; it will remain offline until reviewed.</p> : filteredVehicles.length === 0 ? <p className="rounded-3xl bg-white p-6 text-slate">No motorcycles match these filters.</p> : null}
    </section>
    <section><h2 className="text-xl font-extrabold text-navy">Manual availability requests</h2><div className="mt-4 grid gap-3">{requests.length ? requests.map((request) => <article key={request.id} className="rounded-3xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-orange">{request.reference_code}</p><p className="mt-2 font-extrabold text-navy">{String(request.request_payload.pickupAddress ?? "Pickup")} → {String(request.request_payload.deliveryAddress ?? "Destination")}</p><p className="mt-2 text-sm text-slate">{request.decision.replaceAll("_", " ")} · {request.reason_code.replaceAll("_", " ")} · {request.road_distance_meters ? `${(request.road_distance_meters / 1000).toFixed(1)} km` : "Distance unavailable"}</p><div className="mt-4 grid gap-2 sm:flex"><Button disabled={pending} variant="outline" onClick={() => setDecision({ id: request.id, status: "approved" })}>Approve for follow-up</Button><Button disabled={pending} variant="ghost" onClick={() => setDecision({ id: request.id, status: "rejected" })}>Reject</Button></div></article>) : <p className="rounded-3xl bg-white p-6 text-slate">No pending requests.</p>}</div></section>
    <section><h2 className="text-xl font-extrabold text-navy">Orders awaiting assignment</h2><div className="mt-4 grid gap-3">{orders.length ? orders.map((order) => <form key={order.id} action={(form) => assign(order, form)} className="grid min-w-0 gap-3 rounded-3xl bg-white p-5 shadow-sm"><p className="font-extrabold text-navy">{order.order_reference}</p><p className="break-words text-sm leading-6 text-slate">{order.pickup_address} → {order.delivery_address}</p><div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Bike<select required name="vehicleId" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="">Choose a bike with capacity</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id} disabled={!isRealVehicleRegistration(vehicle.registration_number) || !["available", "assigned"].includes(vehicle.operational_status) || vehicle.safety_status !== "cleared" || !vehicle.assigned_rider_id}>{isRealVehicleRegistration(vehicle.registration_number) ? vehicle.registration_number : "Real plate needed"} · {vehicle.code} · {vehicle.operational_status} · limit {vehicle.max_active_assignments}</option>)}</select></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Rider<select required name="riderId" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="">Choose an active rider</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.full_name}</option>)}</select></label></div><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Override reason (only if needed)<input name="overrideReason" placeholder="Explain why dispatch should use a different rider" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label><Button className="w-full sm:w-auto" disabled={pending || !vehicles.some((vehicle) => isRealVehicleRegistration(vehicle.registration_number) && ["available", "assigned"].includes(vehicle.operational_status) && vehicle.safety_status === "cleared" && vehicle.assigned_rider_id)} type="submit">Check remaining capacity and assign</Button></form>) : <p className="rounded-3xl bg-white p-6 text-slate">No orders are awaiting assignment.</p>}</div></section>
    <ActionFeedback feedback={feedback} pending={pending} pendingText="Updating dispatch…" onDismiss={() => setFeedback(null)} />
    <ReasonDialog
      open={Boolean(decision)}
      title={decision?.status === "approved" ? "Approve this route for follow-up?" : "Reject this route request?"}
      description={decision?.status === "approved" ? "Approval records an operational decision only. It does not create an order or charge the customer." : "Record why this request cannot proceed so the decision remains auditable."}
      confirmLabel={decision?.status === "approved" ? "Approve request" : "Reject request"}
      pending={pending}
      onCancel={() => setDecision(null)}
      onConfirm={(reason) => decision ? decide(decision.id, decision.status, reason) : undefined}
    />
  </div>;
}
