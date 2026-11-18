"use client";

import { useState } from "react";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";
import { Button } from "@/components/ui/button";

export type AttemptResolution = "retry_immediately" | "schedule_redelivery" | "correct_address" | "return_to_sender" | "authorized_hold" | "open_incident" | "cancel";
export type AttemptAttribution = "customer" | "dovid" | "under_review";
export type AttemptResolutionInput = {
  resolution: AttemptResolution;
  attributableTo: AttemptAttribution;
  reason: string;
  scheduledAt?: string;
  correctedAddress?: string;
  correctedLatitude?: number;
  correctedLongitude?: number;
};

export type AttemptForReview = {
  id: string;
  order_id: string;
  attempt_number: number;
  status: string;
  failure_reason: string | null;
  created_at: string;
  delivery_orders: {
    order_reference: string;
    pickup_address: string;
    delivery_address: string;
    recipient_name: string;
    recipient_phone: string;
  } | null;
};

const blankAddress: AddressValue = { address: "", latitude: "", longitude: "" };
const controlClass = "min-h-12 min-w-0 w-full rounded-2xl border border-slate/25 bg-white px-4 text-base font-normal outline-none transition focus:border-orange focus:ring-4 focus:ring-orange/10";

export function AttemptResolutionCard({ attempt, pending, onResolve }: {
  attempt: AttemptForReview;
  pending: boolean;
  onResolve: (attemptId: string, input: AttemptResolutionInput) => Promise<void>;
}) {
  const [resolution, setResolution] = useState<AttemptResolution>("schedule_redelivery");
  const [attribution, setAttribution] = useState<AttemptAttribution>("under_review");
  const [correctedAddress, setCorrectedAddress] = useState(blankAddress);
  const order = attempt.delivery_orders;

  async function submit(form: FormData) {
    const scheduledLocal = String(form.get("scheduledAt") ?? "");
    await onResolve(attempt.id, {
      resolution,
      attributableTo: attribution,
      reason: String(form.get("reason") ?? "").trim(),
      scheduledAt: resolution === "schedule_redelivery" && scheduledLocal ? new Date(scheduledLocal).toISOString() : undefined,
      correctedAddress: resolution === "correct_address" ? correctedAddress.address : undefined,
      correctedLatitude: resolution === "correct_address" ? Number(correctedAddress.latitude) : undefined,
      correctedLongitude: resolution === "correct_address" ? Number(correctedAddress.longitude) : undefined,
    });
  }

  const customerChargeNeedsApproval = attribution === "customer" && ["schedule_redelivery", "return_to_sender"].includes(resolution);

  return <details className="group rounded-3xl bg-white p-4 shadow-sm sm:p-5">
    <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block font-extrabold text-navy">{order?.order_reference ?? `Attempt ${attempt.attempt_number}`}</span>
        <span className="mt-1 block text-sm capitalize leading-6 text-slate">Attempt {attempt.attempt_number} · {attempt.status.replaceAll("_", " ")}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-2xl text-orange transition group-open:rotate-45">+</span>
    </summary>

    <div className="mt-4 grid gap-3 border-t border-navy/8 pt-4 text-sm leading-6 text-slate">
      <p><strong className="text-navy">Reported reason:</strong> {attempt.failure_reason || "No reason recorded"}</p>
      {order ? <>
        <p className="break-words"><strong className="text-navy">Route:</strong> {order.pickup_address} → {order.delivery_address}</p>
        <p><strong className="text-navy">Receiver:</strong> {order.recipient_name} · {order.recipient_phone}</p>
      </> : <p className="rounded-2xl bg-red-50 p-3 text-red-900">The related order details could not be loaded. Do not resolve this attempt until the order is available.</p>}
      <p className="text-xs">Reported {new Date(attempt.created_at).toLocaleString("en-NG")}</p>
    </div>

    <form action={submit} className="mt-5 grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-navy">What should happen next?
        <select name="resolution" value={resolution} onChange={(event) => setResolution(event.target.value as AttemptResolution)} className={controlClass}>
          <option value="schedule_redelivery">Schedule another delivery attempt</option>
          <option value="retry_immediately">Retry immediately</option>
          <option value="correct_address">Correct the destination address</option>
          <option value="return_to_sender">Return the parcel to the sender</option>
          <option value="authorized_hold">Keep the parcel on an authorized hold</option>
          <option value="open_incident">Open a formal incident</option>
          <option value="cancel">Cancel after authorized review</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm font-bold text-navy">Who caused the failed attempt?
        <select name="attributableTo" value={attribution} onChange={(event) => setAttribution(event.target.value as AttemptAttribution)} className={controlClass}>
          <option value="under_review">Still under review</option>
          <option value="customer">Customer or receiver</option>
          <option value="dovid">Dovid operations</option>
        </select>
      </label>

      {resolution === "schedule_redelivery" ? <label className="grid gap-2 text-sm font-bold text-navy">Agreed redelivery date and time
        <input required name="scheduledAt" type="datetime-local" className={controlClass} />
      </label> : null}

      {resolution === "correct_address" ? <AddressAutocomplete label="Corrected destination address" value={correctedAddress} onChange={setCorrectedAddress} /> : null}

      <label className="grid gap-2 text-sm font-bold text-navy">Decision reason and verification evidence
        <textarea required minLength={8} maxLength={1000} name="reason" className={`${controlClass} min-h-28 py-3`} placeholder="Record who was contacted, what was verified and why this action is appropriate" />
      </label>

      <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>No charge is created automatically.</strong> {customerChargeNeedsApproval ? "Because this is marked customer-attributable, any redelivery or return fee must be proposed separately, approved and paid through the verified payment flow." : "Any customer fee still requires a separate approved charge and verified payment."}
      </div>

      <Button className="w-full" disabled={pending || !order || (resolution === "correct_address" && (!correctedAddress.latitude || !correctedAddress.longitude))} type="submit">
        {pending ? "Saving reviewed resolution…" : "Save reviewed resolution"}
      </Button>
    </form>
  </details>;
}
