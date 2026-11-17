"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";
import { Button } from "@/components/ui/button";

type DraftRow = { id: string; customer_name: string; customer_phone: string; customer_email?: string | null; status: string; booking_origin: string; created_at: string };
type QuoteResult = { reviewUrl?: string; verificationCode?: string; whatsappUrl?: string; message?: string; error?: string; automatedMessageSent?: boolean };
const blankAddress: AddressValue = { address: "", latitude: "", longitude: "" };

export function AssistedBookingConsole({ drafts }: { drafts: DraftRow[] }) {
  const router = useRouter();
  const [pickup, setPickup] = useState(blankAddress);
  const [destination, setDestination] = useState(blankAddress);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);

  async function createDraft(form: FormData) {
    setPending(true);
    setResult(null);
    const payload = {
      idempotencyKey: crypto.randomUUID(),
      bookingOrigin: form.get("bookingOrigin"),
      customerName: form.get("customerName"),
      customerPhone: form.get("customerPhone"),
      customerEmail: String(form.get("customerEmail") ?? "").trim() || undefined,
      phoneSource: form.get("phoneSource"),
      pickupAddress: pickup.address,
      pickupCoordinates: { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) },
      deliveryAddress: destination.address,
      deliveryCoordinates: { latitude: Number(destination.latitude), longitude: Number(destination.longitude) },
      senderName: form.get("senderName"),
      senderPhone: form.get("senderPhone"),
      recipientName: form.get("recipientName"),
      recipientPhone: form.get("recipientPhone"),
      packageCategory: form.get("packageCategory"),
      packageSize: form.get("packageSize"),
      packageDescription: form.get("packageDescription"),
      weightGrams: form.get("weightGrams") ? Number(form.get("weightGrams")) : undefined,
      serviceLevel: form.get("serviceLevel"),
      paymentMethod: form.get("paymentMethod"),
      payer: form.get("payer"),
      promotionCode: String(form.get("promotionCode") ?? "").trim() || undefined,
      additionalStops: [],
      oversized: false,
    };
    const draftResponse = await fetch("/api/admin/assisted-bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const draft = await draftResponse.json();
    if (!draftResponse.ok) { setPending(false); setResult({ error: draft.error ?? "Draft could not be created." }); return; }
    const quoteResponse = await fetch(`/api/admin/assisted-bookings/${draft.id}/quote`, { method: "POST" });
    const quote = await quoteResponse.json() as QuoteResult;
    setPending(false);
    setResult(quoteResponse.ok ? quote : { error: quote.error ?? quote.message ?? "Quote needs review." });
    if (quoteResponse.ok) router.refresh();
  }

  return <div className="grid gap-8">
    <form action={createDraft} className="grid gap-5 rounded-3xl bg-white p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2 text-sm font-bold text-navy">Booking channel<select name="bookingOrigin" className="rounded-xl border p-3 font-normal"><option value="whatsapp_admin">WhatsApp</option><option value="phone_admin">Phone</option><option value="other_admin">Other assisted</option></select></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Customer name<input required minLength={2} name="customerName" className="rounded-xl border p-3 font-normal" /></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Customer phone<input required name="customerPhone" inputMode="tel" className="rounded-xl border p-3 font-normal" /></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Customer email <span className="font-normal text-slate">(optional)</span><input name="customerEmail" type="email" autoComplete="email" className="rounded-xl border p-3 font-normal" placeholder="For delivery updates" /></label>
      </div>
      <label className="grid gap-2 text-sm font-bold text-navy">Phone verification source<select name="phoneSource" className="rounded-xl border p-3 font-normal"><option value="customer_provided">Customer provided</option><option value="verified_profile">Verified account profile</option><option value="admin_verified">Administrator verified</option></select></label>
      <div className="grid gap-5 lg:grid-cols-2"><AddressAutocomplete label="Pickup address" value={pickup} onChange={setPickup} /><AddressAutocomplete label="Destination address" value={destination} onChange={setDestination} /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2 text-sm font-bold text-navy">Sender name<input required name="senderName" className="rounded-xl border p-3 font-normal" /></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Sender phone<input required name="senderPhone" inputMode="tel" className="rounded-xl border p-3 font-normal" /></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Recipient name<input required name="recipientName" className="rounded-xl border p-3 font-normal" /></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Recipient phone<input required name="recipientPhone" inputMode="tel" className="rounded-xl border p-3 font-normal" /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2 text-sm font-bold text-navy">Package type<select name="packageCategory" className="rounded-xl border p-3 font-normal"><option value="parcel">Parcel</option><option value="document">Document</option><option value="food">Food</option><option value="other">Other</option></select></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Size<select name="packageSize" className="rounded-xl border p-3 font-normal"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Weight (grams)<input name="weightGrams" type="number" min={1} className="rounded-xl border p-3 font-normal" /></label>
        <label className="grid gap-2 text-sm font-bold text-navy">Service<select name="serviceLevel" className="rounded-xl border p-3 font-normal"><option value="standard">Standard</option><option value="express">Express</option></select></label>
      </div>
      <label className="grid gap-2 text-sm font-bold text-navy">Package description<textarea required minLength={3} name="packageDescription" className="min-h-24 rounded-xl border p-3 font-normal" /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-navy">Who pays?<select name="payer" className="rounded-xl border p-3 font-normal"><option value="sender">Sender</option><option value="receiver_before_delivery">Receiver before delivery</option><option value="receiver_at_delivery">Receiver at delivery</option></select></label><label className="grid gap-2 text-sm font-bold text-navy">Payment method<select name="paymentMethod" className="rounded-xl border p-3 font-normal"><option value="online">Online payment</option><option value="bank_transfer">Verified company transfer</option></select></label><label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">Discount code <span className="font-normal text-slate">(optional)</span><input name="promotionCode" autoCapitalize="characters" className="rounded-xl border p-3 font-normal uppercase" /></label></div>
      <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">Creating this draft does not confirm a booking or charge anyone. The customer reviews the secure link, confirms the quote and completes the required payment flow. No account or sign-in is required. Email is optional; keep the phone number so the rider can reach the sender or receiver when necessary.</div>
      <Button disabled={pending || !pickup.latitude || !destination.latitude} type="submit">{pending ? "Checking route and pricing…" : "Create draft and check quote"}</Button>
    </form>
    {result ? <section role="status" className={`rounded-3xl p-6 ${result.error ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-950"}`}><p className="font-extrabold">{result.error ?? result.message ?? "Secure customer review link created."}</p>{result.reviewUrl ? <><label className="mt-4 grid gap-2 text-sm font-bold">Review URL<input readOnly value={result.reviewUrl} className="rounded-xl border bg-white p-3 font-normal" /></label><p className="mt-3 text-sm">One-time verification code: <strong>{result.verificationCode}</strong>. Send it only through the customer-controlled contact channel.</p>{result.whatsappUrl ? <a href={result.whatsappUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-white">Open manual WhatsApp message</a> : null}<p className="mt-3 text-xs">No automated message was sent.</p></> : null}</section> : null}
    <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-extrabold text-navy">Assisted booking queue</h2><div className="mt-4 grid gap-3">{drafts.map((draft) => <article key={draft.id} className="rounded-2xl bg-cloud p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold text-navy">{draft.customer_name}</p><p className="text-sm text-slate">{draft.booking_origin.replaceAll("_", " ")} · phone ending {draft.customer_phone.slice(-4)}</p><p className="mt-1 break-all text-xs text-slate">{draft.customer_email ? `Email updates: ${draft.customer_email}` : "Email updates not requested"}</p></div><p className="text-sm font-bold capitalize text-orange">{draft.status.replaceAll("_", " ")}</p></div></article>)}{!drafts.length ? <p className="text-slate">No assisted booking drafts yet.</p> : null}</div></section>
  </div>;
}

