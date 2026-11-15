"use client";

import { useState } from "react";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

const emptyAddress = { address: "", latitude: "", longitude: "" };

export function QuoteEstimator() {
  const [pickup, setPickup] = useState<AddressValue>(emptyAddress);
  const [delivery, setDelivery] = useState<AddressValue>(emptyAddress);
  const [state, setState] = useState<{ pending: boolean; error?: string; amount?: number; currency?: string }>({ pending: false });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ pending: true });
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/delivery/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickupAddress: pickup.address,
        pickupCoordinates: { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) },
        deliveryAddress: delivery.address,
        deliveryCoordinates: { latitude: Number(delivery.latitude), longitude: Number(delivery.longitude) },
        packageCategory: form.get("packageCategory"),
        packageSize: form.get("packageSize"),
        serviceLevel: form.get("serviceLevel"),
        paymentMethod: "online"
      })
    });
    const body = await response.json();
    setState(response.ok ? { pending: false, amount: body.customerTotalKobo, currency: body.currency } : { pending: false, error: body.error ?? "We could not calculate a price right now." });
  }

  const ready = pickup.latitude && pickup.longitude && delivery.latitude && delivery.longitude;
  return <form onSubmit={submit} className="grid gap-5 rounded-[2rem] bg-white p-7 shadow-sm">
    <AddressAutocomplete label="Pickup address" value={pickup} onChange={setPickup} />
    <AddressAutocomplete label="Delivery address" value={delivery} onChange={setDelivery} />
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="grid gap-2 text-sm font-semibold text-navy">What are you sending?<select name="packageCategory" className="min-h-12 rounded-2xl border border-slate/25 px-4"><option value="document">Documents</option><option value="parcel">A parcel</option><option value="food">Food</option><option value="other">Something else</option></select></label>
      <label className="grid gap-2 text-sm font-semibold text-navy">Size<select name="packageSize" className="min-h-12 rounded-2xl border border-slate/25 px-4"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
      <label className="grid gap-2 text-sm font-semibold text-navy">Delivery speed<select name="serviceLevel" className="min-h-12 rounded-2xl border border-slate/25 px-4"><option value="standard">Standard</option><option value="express">As soon as possible</option><option value="scheduled">Choose a time</option></select></label>
    </div>
    {state.error ? <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{state.error}</p> : null}
    {state.amount !== undefined ? <div className="rounded-2xl bg-navy p-5 text-white"><p className="text-sm text-white/65">Your estimated delivery price</p><p className="mt-1 text-3xl font-extrabold text-orange">{formatMoney(state.amount, state.currency)}</p><p className="mt-2 text-xs text-white/55">This price is held for 10 minutes.</p></div> : null}
    <Button type="submit" disabled={state.pending || !ready}>{state.pending ? "Checking price…" : "See my price"}</Button>
  </form>;
}
