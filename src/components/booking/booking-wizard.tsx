"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";
import { formatMoney } from "@/lib/utils";

type Draft = Record<string, string>;
type CustomerQuote = {
  quoteId: string;
  distanceMeters: number;
  customerTotalKobo: number;
  currency: string;
  includedCharges: Array<{ label: string; amountKobo: number }>;
  expiresAt: string;
};

const steps = ["Addresses", "Parcel", "Contact details", "Review", "Payment"];
const emptyDraft: Draft = {
  pickupAddress: "", pickupLatitude: "", pickupLongitude: "",
  deliveryAddress: "", deliveryLatitude: "", deliveryLongitude: "",
  packageCategory: "parcel", packageSize: "small", packageDescription: "",
  serviceLevel: "standard", scheduledAt: "", oversized: "false",
  senderName: "", senderPhone: "", recipientName: "", recipientPhone: "",
  payer: "sender", paymentMethod: "online"
};

export function BookingWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [additionalStops, setAdditionalStops] = useState<AddressValue[]>([]);
  const [quote, setQuote] = useState<CustomerQuote | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem("dovid-booking-draft");
      const savedStops = localStorage.getItem("dovid-booking-stops");
      if (saved) setDraft({ ...emptyDraft, ...JSON.parse(saved) });
      if (savedStops) setAdditionalStops(JSON.parse(savedStops));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("dovid-booking-draft", JSON.stringify(draft));
    localStorage.setItem("dovid-booking-stops", JSON.stringify(additionalStops));
  }, [draft, additionalStops, hydrated]);

  const set = (key: string, invalidatesQuote = true) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setDraft(current => ({ ...current, [key]: event.target.value }));
    if (invalidatesQuote) setQuote(null);
  };
  const updateAddress = (prefix: "pickup" | "delivery", value: AddressValue) => {
    setDraft(current => ({
      ...current,
      [`${prefix}Address`]: value.address,
      [`${prefix}Latitude`]: value.latitude,
      [`${prefix}Longitude`]: value.longitude
    }));
    setQuote(null);
  };
  const pickupAddress = { address: draft.pickupAddress, latitude: draft.pickupLatitude, longitude: draft.pickupLongitude };
  const deliveryAddress = { address: draft.deliveryAddress, latitude: draft.deliveryLatitude, longitude: draft.deliveryLongitude };
  const routeReady = [draft.pickupLatitude, draft.pickupLongitude, draft.deliveryLatitude, draft.deliveryLongitude]
    .every(value => Number.isFinite(Number(value)) && value !== "");
  const allLocationsReady = useMemo(() => [
    draft.pickupLatitude, draft.pickupLongitude, draft.deliveryLatitude, draft.deliveryLongitude,
    ...additionalStops.flatMap(stop => [stop.latitude, stop.longitude])
  ].every(value => Number.isFinite(Number(value)) && value !== "") && additionalStops.every(stop => stop.address.length >= 8), [draft, additionalStops]);
  const serializedStops = additionalStops.map(stop => ({
    address: stop.address,
    coordinates: { latitude: Number(stop.latitude), longitude: Number(stop.longitude) }
  }));

  async function requestQuote(nextStep = 3) {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/delivery/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickupAddress: draft.pickupAddress,
        pickupCoordinates: { latitude: Number(draft.pickupLatitude), longitude: Number(draft.pickupLongitude) },
        deliveryAddress: draft.deliveryAddress,
        deliveryCoordinates: { latitude: Number(draft.deliveryLatitude), longitude: Number(draft.deliveryLongitude) },
        packageCategory: draft.packageCategory,
        packageSize: draft.packageSize,
        serviceLevel: draft.serviceLevel,
        paymentMethod: draft.paymentMethod,
        payer: draft.payer,
        scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : undefined,
        additionalStops: serializedStops,
        oversized: draft.oversized === "true"
      })
    });
    const body = await response.json();
    setPending(false);
    if (!response.ok) return setMessage(body.error ?? "We could not calculate a price right now. Please try again.");
    if (body.eligibility && body.eligibility !== "standard_eligible") {
      setQuote(null);
      setMessage(body.message ?? "This route needs confirmation from our dispatch team.");
      return;
    }
    setQuote(body);
    setMessage(body.message ?? "Great! We can check delivery availability for this route.");
    setStep(nextStep);
  }

  async function confirmOrder() {
    if (!quote) return;
    setPending(true);
    setMessage("");
    const idempotencyKey = crypto.randomUUID();
    const confirmation = await fetch(`/api/delivery/quotes/${quote.quoteId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey })
    });
    const confirmationBody = await confirmation.json();
    if (!confirmation.ok) {
      setPending(false);
      return setMessage(confirmationBody.error ?? "This price has expired. Please request a new one.");
    }
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickupAddress: draft.pickupAddress,
        pickupCoordinates: { latitude: Number(draft.pickupLatitude), longitude: Number(draft.pickupLongitude) },
        deliveryAddress: draft.deliveryAddress,
        deliveryCoordinates: { latitude: Number(draft.deliveryLatitude), longitude: Number(draft.deliveryLongitude) },
        packageCategory: draft.packageCategory,
        packageSize: draft.packageSize,
        packageDescription: draft.packageDescription,
        serviceLevel: draft.serviceLevel,
        scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : undefined,
        additionalStops: serializedStops,
        oversized: draft.oversized === "true",
        senderName: draft.senderName,
        senderPhone: draft.senderPhone,
        recipientName: draft.recipientName,
        recipientPhone: draft.recipientPhone,
        payer: draft.payer,
        paymentMethod: draft.paymentMethod,
        quoteId: quote.quoteId,
        idempotencyKey
      })
    });
    const body = await response.json();
    setPending(false);
    if (!response.ok) return setMessage(body.error ?? "We could not complete your booking. Please try again.");
    localStorage.removeItem("dovid-booking-draft");
    localStorage.removeItem("dovid-booking-stops");
    if (body.receiver_payment_token) sessionStorage.setItem(`dovid-receiver-token-${body.order_id}`, body.receiver_payment_token);
    if (draft.payer === "sender") {
      const payment = await fetch("/api/payments/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: body.order_id, idempotencyKey: crypto.randomUUID() }) }).catch(() => null);
      if (payment?.ok) {
        const paymentBody = await payment.json();
        window.location.assign(paymentBody.checkoutUrl);
        return;
      }
    }
    window.location.assign(new URL(`/account/orders/${body.order_id}`, window.location.origin).toString());
  }

  return <div className="grid min-w-0 gap-8 lg:grid-cols-[260px_1fr]" data-hydrated={hydrated}>
    <aside className="min-w-0"><ol className="flex gap-2 overflow-x-auto lg:grid">{steps.map((label, index) => <li key={label} className={`flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${index === step ? "bg-navy text-white" : index < step ? "bg-orange/10 text-orange" : "bg-white text-slate"}`}><span className="grid size-7 place-items-center rounded-full border border-current/25">{index < step ? <Check className="size-4" /> : index + 1}</span>{label}</li>)}</ol></aside>
    <section className="min-w-0 rounded-[2rem] border border-navy/10 bg-white p-6 shadow-sm md:p-9">
      <h2 className="text-2xl font-extrabold text-navy">{steps[step]}</h2>
      <div className="mt-7 grid gap-5">
        {step === 0 ? <><AddressAutocomplete label="Where should we collect the parcel?" value={pickupAddress} onChange={value => updateAddress("pickup", value)} /><AddressAutocomplete label="Where should we deliver it?" value={deliveryAddress} onChange={value => updateAddress("delivery", value)} /></> : null}
        {step === 1 ? <>
          <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold text-navy">What are you sending?<select className="min-h-12 rounded-2xl border border-slate/25 px-4" value={draft.packageCategory} onChange={set("packageCategory")}><option value="document">Documents</option><option value="parcel">A parcel</option><option value="food">Food</option><option value="other">Something else</option></select></label><label className="grid gap-2 text-sm font-semibold text-navy">About how big is it?<select className="min-h-12 rounded-2xl border border-slate/25 px-4" value={draft.packageSize} onChange={set("packageSize")}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label></div>
          <label className="grid gap-2 text-sm font-semibold text-navy">When do you need it delivered?<select className="min-h-12 rounded-2xl border border-slate/25 px-4" value={draft.serviceLevel} onChange={set("serviceLevel")}><option value="standard">Standard delivery</option><option value="express">As soon as possible</option><option value="scheduled">Choose a time</option></select></label>
          {draft.serviceLevel === "scheduled" ? <Field label="Pickup date and time" type="datetime-local" value={draft.scheduledAt} onChange={set("scheduledAt")} /> : null}
          <label className="grid gap-2 text-sm font-semibold text-navy">Does it need extra space?<select className="min-h-12 rounded-2xl border border-slate/25 px-4" value={draft.oversized} onChange={set("oversized")}><option value="false">No, it fits on a motorcycle</option><option value="true">Yes, it is oversized</option></select></label>
          <div className="rounded-2xl border border-navy/10 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-bold text-navy">Need another stop?</p><p className="text-xs text-slate">Add up to five stops. We will include them in your price.</p></div><button type="button" disabled={additionalStops.length >= 5} className="rounded-full border border-orange px-4 py-2 text-sm font-bold text-orange disabled:opacity-40" onClick={() => { setAdditionalStops(current => [...current, { address: "", latitude: "", longitude: "" }]); setQuote(null); }}>Add a stop</button></div><div className="mt-4 grid gap-4">{additionalStops.map((stop, index) => <div key={index} className="grid gap-3 rounded-2xl bg-cloud p-4"><div className="flex justify-between"><p className="text-sm font-bold text-navy">Stop {index + 1}</p><button type="button" className="text-xs font-bold text-red-700" onClick={() => { setAdditionalStops(current => current.filter((_, position) => position !== index)); setQuote(null); }}>Remove</button></div><AddressAutocomplete label="Stop address" value={stop} onChange={value => { setAdditionalStops(current => current.map((item, position) => position === index ? value : item)); setQuote(null); }} /></div>)}</div></div>
          <TextareaField label="Anything we should know about the parcel?" placeholder="For example: fragile, contains food, or call before pickup" value={draft.packageDescription} onChange={set("packageDescription")} />
        </> : null}
        {step === 2 ? <><div className="grid gap-4 sm:grid-cols-2"><Field label="Your name" value={draft.senderName} onChange={set("senderName", false)} /><Field label="Your phone number" value={draft.senderPhone} onChange={set("senderPhone", false)} /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Receiver's name" value={draft.recipientName} onChange={set("recipientName", false)} /><Field label="Receiver's phone number" value={draft.recipientPhone} onChange={set("recipientPhone", false)} /></div></> : null}
        {step === 3 ? quote ? <div className="grid gap-4"><div className="rounded-3xl bg-cloud p-6"><p className="text-sm text-slate">Journey</p><p className="mt-1 font-bold text-navy">{draft.pickupAddress} → {draft.deliveryAddress}</p><p className="mt-4 text-sm text-slate">Distance</p><p className="font-bold text-navy">{(quote.distanceMeters / 1000).toFixed(1)} km</p><p className="mt-4 text-sm text-slate">Your delivery price</p><p className="text-3xl font-extrabold text-orange">{formatMoney(quote.customerTotalKobo, quote.currency)}</p>{quote.includedCharges.map(charge => <div key={charge.label} className="mt-2 flex justify-between text-sm text-slate"><span>{charge.label}</span><span>{formatMoney(charge.amountKobo, quote.currency)}</span></div>)}</div><p className="text-sm leading-6 text-slate">This price includes the route and delivery option you chose. It is held until {new Date(quote.expiresAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}.</p></div> : <p className="text-slate">Complete the previous steps to see your price.</p> : null}
        {step === 4 ? <><label className="grid gap-2 text-sm font-semibold text-navy">Who will pay?<select className="min-h-12 rounded-2xl border border-slate/25 px-4" value={draft.payer} onChange={set("payer")}><option value="sender">I will pay</option><option value="receiver_before_delivery">The receiver will pay before delivery</option><option value="receiver_at_delivery">The receiver will pay when it arrives</option></select></label><label className="grid gap-2 text-sm font-semibold text-navy">How would you like to pay?<select className="min-h-12 rounded-2xl border border-slate/25 px-4" value={draft.paymentMethod} onChange={set("paymentMethod")}><option value="online">Pay online</option><option value="bank_transfer">Pay by bank transfer</option></select></label><p className="rounded-2xl bg-cloud p-4 text-sm leading-6 text-slate">Payments are completed through Dovid checkout or the Dovid company account. Your rider will not ask you to pay them directly.</p>{!quote ? <Button type="button" disabled={pending} onClick={() => requestQuote(4)}>{pending ? "Updating price…" : "Update price"}</Button> : null}</> : null}
        {message ? <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p> : null}
      </div>
      <div className="mt-8 flex flex-wrap justify-between gap-3"><Button variant="ghost" disabled={step === 0 || pending} onClick={() => setStep(current => current - 1)}><ChevronLeft className="mr-2 size-4" />Back</Button>{step < 2 ? <Button disabled={pending || (step === 0 && !routeReady)} onClick={() => setStep(current => current + 1)}>Continue<ChevronRight className="ml-2 size-4" /></Button> : null}{step === 2 ? <Button disabled={pending || !allLocationsReady} onClick={() => requestQuote(3)}>{pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}See my price</Button> : null}{step === 3 ? <Button disabled={!quote} onClick={() => setStep(4)}>Continue to payment<ChevronRight className="ml-2 size-4" /></Button> : null}{step === 4 && quote ? <Button disabled={pending} onClick={confirmOrder}>{pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}{draft.payer === "sender" ? "Create delivery and pay" : "Confirm delivery"}</Button> : null}</div>
    </section>
  </div>;
}
