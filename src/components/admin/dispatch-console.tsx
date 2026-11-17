"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/ui/reason-dialog";

type Rider = { id: string; full_name: string | null };
type Vehicle = { id: string; code: string; operational_status: string; safety_status: string; assigned_rider_id: string | null; home_territory_codes: string[]; max_active_assignments: number; max_payload_weight_grams: number | null; cargo_length_mm: number | null; cargo_width_mm: number | null; cargo_height_mm: number | null; capacity_verified_at: string | null };
type Request = { id: string; decision: string; reason_code: string; road_distance_meters: number | null; created_at: string; request_payload: Record<string, unknown> };
type Order = { id: string; order_reference: string; pickup_address: string; delivery_address: string; pickup_zone_id: string | null };

export function DispatchConsole({ vehicles, riders, requests, orders }: { vehicles: Vehicle[]; riders: Rider[]; requests: Request[]; orders: Order[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [decision, setDecision] = useState<{ id: string; status: "approved" | "rejected" } | null>(null);

  async function decide(id: string, status: "approved" | "rejected", reason: string) {
    setPending(true);
    const response = await fetch(`/api/admin/dispatch/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) {
      setFeedback({ text: body.error ?? "The availability request could not be updated.", ok: false });
      return;
    }
    setDecision(null);
    setFeedback({ text: `Request ${status}. No order or charge was created.`, ok: true });
    router.refresh();
  }

  async function updateVehicle(vehicle: Vehicle, form: FormData) {
    setPending(true);
    const response = await fetch(`/api/admin/dispatch/fleet/${vehicle.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignedRiderId: form.get("riderId") || null, operationalStatus: form.get("status"), safetyStatus: form.get("safetyStatus"), maxActiveAssignments: Number(form.get("maxActiveAssignments")), maxPayloadWeightGrams: form.get("maxPayloadWeightGrams") ? Number(form.get("maxPayloadWeightGrams")) : null, cargoLengthMm: form.get("cargoLengthMm") ? Number(form.get("cargoLengthMm")) : null, cargoWidthMm: form.get("cargoWidthMm") ? Number(form.get("cargoWidthMm")) : null, cargoHeightMm: form.get("cargoHeightMm") ? Number(form.get("cargoHeightMm")) : null, capacityVerified: form.get("capacityVerified") === "on", reason: form.get("reason") }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setFeedback({ text: body.error ?? "The bike configuration could not be updated.", ok: false });
    setFeedback({ text: "Bike configuration updated and recorded.", ok: true });
    router.refresh();
  }

  async function assign(order: Order, form: FormData) {
    setPending(true);
    const response = await fetch("/api/admin/dispatch/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, vehicleId: form.get("vehicleId"), riderId: form.get("riderId"), overrideReason: form.get("overrideReason") || undefined }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setFeedback({ text: body.error ?? "The assignment could not be completed.", ok: false });
    setFeedback({ text: `Assignment recorded with score ${body.score}.`, ok: true });
    router.refresh();
  }

  return <div className="grid gap-8">
    <section><h2 className="text-xl font-extrabold text-navy">Two-bike readiness</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{vehicles.map((vehicle) => <form key={vehicle.id} action={(form) => updateVehicle(vehicle, form)} className="grid min-w-0 gap-4 rounded-3xl bg-white p-4 shadow-sm sm:p-6"><div><p className="text-xl font-extrabold text-navy">{vehicle.code}</p><p className="mt-1 break-words text-sm leading-6 text-slate">Preferred territories: {vehicle.home_territory_codes.join(", ") || "None"}. Preferences never prevent a safer assignment.</p></div><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Assigned rider<select name="riderId" defaultValue={vehicle.assigned_rider_id ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="">Not assigned</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.full_name || rider.id}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Status<select name="status" defaultValue={vehicle.operational_status} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="offline">Offline</option><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="suspended">Suspended</option></select></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Safety<select name="safetyStatus" defaultValue={vehicle.safety_status} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"><option value="cleared">Cleared</option><option value="review_required">Review required</option><option value="blocked">Blocked</option></select></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Maximum parcels<input required name="maxActiveAssignments" type="number" min={1} max={5} defaultValue={vehicle.max_active_assignments} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-bold text-navy">Payload (grams)<input name="maxPayloadWeightGrams" type="number" min={1} defaultValue={vehicle.max_payload_weight_grams ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label></div><fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 text-sm font-bold text-navy sm:col-span-3">Cargo space in millimetres</legend><label className="grid min-w-0 gap-2 text-sm font-semibold text-navy">Length<input name="cargoLengthMm" type="number" min={1} defaultValue={vehicle.cargo_length_mm ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-semibold text-navy">Width<input name="cargoWidthMm" type="number" min={1} defaultValue={vehicle.cargo_width_mm ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-semibold text-navy">Height<input name="cargoHeightMm" type="number" min={1} defaultValue={vehicle.cargo_height_mm ?? ""} className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label></fieldset><label className="flex min-h-12 items-start gap-3 rounded-xl border p-3 text-sm font-bold leading-6 text-navy"><input name="capacityVerified" type="checkbox" defaultChecked={Boolean(vehicle.capacity_verified_at)} className="mt-1 size-5 shrink-0"/>I measured and verified this capacity</label><label className="grid gap-2 text-sm font-bold text-navy">Reason and capacity evidence<input required minLength={8} name="reason" className="min-h-12 min-w-0 rounded-xl border p-3 font-normal"/></label><Button disabled={pending} type="submit">{pending ? "Saving bike status…" : "Save bike status"}</Button></form>)}</div></section>
    <section><h2 className="text-xl font-extrabold text-navy">Manual availability requests</h2><div className="mt-4 grid gap-3">{requests.length ? requests.map((request) => <article key={request.id} className="rounded-3xl bg-white p-5 shadow-sm"><p className="font-extrabold text-navy">{String(request.request_payload.pickupAddress ?? "Pickup")} → {String(request.request_payload.deliveryAddress ?? "Destination")}</p><p className="mt-2 text-sm text-slate">{request.decision.replaceAll("_", " ")} · {request.reason_code.replaceAll("_", " ")} · {request.road_distance_meters ? `${(request.road_distance_meters / 1000).toFixed(1)} km` : "Distance unavailable"}</p><div className="mt-4 grid gap-2 sm:flex"><Button disabled={pending} variant="outline" onClick={() => setDecision({ id: request.id, status: "approved" })}>Approve for follow-up</Button><Button disabled={pending} variant="ghost" onClick={() => setDecision({ id: request.id, status: "rejected" })}>Reject</Button></div></article>) : <p className="rounded-3xl bg-white p-6 text-slate">No pending requests.</p>}</div></section>
    <section><h2 className="text-xl font-extrabold text-navy">Orders awaiting assignment</h2><div className="mt-4 grid gap-3">{orders.length ? orders.map((order) => <form key={order.id} action={(form) => assign(order, form)} className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm"><p className="font-extrabold text-navy">{order.order_reference}</p><p className="text-sm text-slate">{order.pickup_address} → {order.delivery_address}</p><div className="grid gap-3 sm:grid-cols-2"><select required name="vehicleId" className="rounded-xl border p-3"><option value="">Choose bike</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} · {vehicle.operational_status}</option>)}</select><select required name="riderId" className="rounded-xl border p-3"><option value="">Choose rider</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.full_name || rider.id}</option>)}</select></div><input name="overrideReason" placeholder="Override reason when using a different rider" className="rounded-xl border p-3 text-sm"/><Button disabled={pending} type="submit">Check capacity and assign</Button></form>) : <p className="rounded-3xl bg-white p-6 text-slate">No orders are awaiting assignment.</p>}</div></section>
    {feedback ? <p role={feedback.ok ? "status" : "alert"} className={`rounded-2xl p-4 text-sm ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{feedback.text}</p> : null}
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
