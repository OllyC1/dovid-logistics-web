"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DraftRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  status: string;
  booking_origin: string;
  created_at: string;
};

type QuoteResult = {
  quote?: { amountMinor: number; currency: string; distanceMeters: number; duration: string };
  reviewUrl?: string;
  verificationCode?: string;
  whatsappUrl?: string;
  message?: string;
  error?: string;
  automatedMessageSent?: boolean;
  confirmedBookingCreated?: boolean;
};

const blankAddress: AddressValue = { address: "", latitude: "", longitude: "" };
const controlClass = "min-h-12 w-full rounded-2xl border border-slate/25 bg-white px-4 text-base font-normal outline-none transition focus:border-orange focus:ring-4 focus:ring-orange/10";
const steps = [
  { number: 1, label: "Contact" },
  { number: 2, label: "Delivery" },
  { number: 3, label: "Review" },
] as const;

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(amountMinor / 100);
}

export function AssistedBookingConsole({ drafts }: { drafts: DraftRow[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [pickup, setPickup] = useState(blankAddress);
  const [destination, setDestination] = useState(blankAddress);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [copied, setCopied] = useState("");

  function moveToStep(nextStep: number) {
    if (nextStep > step) {
      const section = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
      const controls = Array.from(section?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? []);
      const invalid = controls.find((control) => !control.checkValidity());
      if (invalid) {
        invalid.reportValidity();
        invalid.focus();
        return;
      }
      if (step === 2 && (!pickup.latitude || !destination.latitude)) {
        setResult({ error: "Choose both addresses from the suggestions so their locations can be confirmed." });
        return;
      }
    }
    setResult(null);
    setStep(Math.max(1, Math.min(3, nextStep)));
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  async function createDraft(form: FormData) {
    if (pending) return;
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

    try {
      const draftResponse = await fetch("/api/admin/assisted-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const draft = await draftResponse.json().catch(() => ({})) as { id?: string; error?: string };
      if (!draftResponse.ok || !draft.id) {
        setResult({ error: draft.error ?? "Draft could not be created. Please check the details and try again." });
        return;
      }

      const quoteResponse = await fetch(`/api/admin/assisted-bookings/${draft.id}/quote`, { method: "POST" });
      const quote = await quoteResponse.json().catch(() => ({})) as QuoteResult;
      if (!quoteResponse.ok) {
        setResult({ error: quote.error ?? quote.message ?? "The route or quote needs manual review." });
        return;
      }
      setResult(quote);
      router.refresh();
    } catch {
      setResult({ error: "We could not reach booking operations. Check the connection and try again; no booking or charge was created." });
    } finally {
      setPending(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${label} copied.`);
    } catch {
      setCopied(`Could not copy ${label.toLowerCase()}. Press and hold the text to copy it.`);
    }
  }

  const resultStyle = result?.error ? "bg-red-50 text-red-950" : result?.reviewUrl ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950";

  return <div className="grid gap-8">
    <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6" aria-labelledby="assisted-booking-form-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange">Authorized staff only</p>
          <h2 id="assisted-booking-form-title" className="mt-2 text-xl font-extrabold text-navy">Help a customer request a delivery</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">Ask one section at a time. The customer does not need an account, and their email remains optional.</p>
        </div>
        <p className="rounded-full bg-cloud px-4 py-2 text-sm font-bold text-navy">Step {step} of 3</p>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-cloud" role="progressbar" aria-label="Assisted booking progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
        <div className="h-full rounded-full bg-orange transition-[width]" style={{ width: `${step / 3 * 100}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Assisted booking steps">
        {steps.map((item) => <li key={item.number} aria-current={step === item.number ? "step" : undefined} className={cn("rounded-xl px-2 py-2 text-center text-xs font-bold", step === item.number ? "bg-navy text-white" : step > item.number ? "bg-emerald-50 text-emerald-900" : "bg-cloud text-slate")}>
          {step > item.number ? <CheckCircle2 className="mr-1 inline size-4" aria-hidden="true" /> : null}{item.label}
        </li>)}
      </ol>

      <form ref={formRef} action={createDraft} className="mt-6 grid gap-6" aria-busy={pending}>
        <fieldset data-step="1" hidden={step !== 1} className="grid gap-5">
          <legend className="text-lg font-extrabold text-navy">Customer and contact details</legend>
          <p className="text-sm leading-6 text-slate">Use the phone number the customer controls. Add email only when they want email updates.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-navy">Booking channel<select name="bookingOrigin" className={controlClass}><option value="whatsapp_admin">WhatsApp</option><option value="phone_admin">Phone</option><option value="other_admin">Other assisted</option></select></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Phone verification source<select name="phoneSource" className={controlClass}><option value="customer_provided">Customer provided</option><option value="verified_profile">Verified account profile</option><option value="admin_verified">Administrator verified</option></select></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Customer name<input required minLength={2} name="customerName" autoComplete="name" className={controlClass} /></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Customer phone<input required minLength={7} name="customerPhone" inputMode="tel" autoComplete="tel" className={controlClass} /></label>
            <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">Customer email <span className="font-normal text-slate">(optional)</span><input name="customerEmail" type="email" autoComplete="email" className={controlClass} placeholder="Only for requested delivery updates" /></label>
          </div>
          <div className="grid gap-4 rounded-2xl bg-cloud p-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-navy">Sender name<input required minLength={2} name="senderName" className={controlClass} /></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Sender phone<input required minLength={7} name="senderPhone" inputMode="tel" className={controlClass} /></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Recipient name<input required minLength={2} name="recipientName" className={controlClass} /></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Recipient phone<input required minLength={7} name="recipientPhone" inputMode="tel" className={controlClass} /></label>
          </div>
          <Button className="w-full" type="button" onClick={() => moveToStep(2)}>Continue to delivery details</Button>
        </fieldset>

        <fieldset data-step="2" hidden={step !== 2} className="grid gap-5">
          <legend className="text-lg font-extrabold text-navy">Addresses and parcel</legend>
          <p className="text-sm leading-6 text-slate">Choose each address from Google suggestions so road routing and service coverage can be checked.</p>
          <div className="grid gap-5 lg:grid-cols-2"><AddressAutocomplete label="Pickup address" value={pickup} onChange={setPickup} /><AddressAutocomplete label="Destination address" value={destination} onChange={setDestination} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-navy">Package type<select name="packageCategory" className={controlClass}><option value="parcel">Parcel</option><option value="document">Document</option><option value="food">Food</option><option value="other">Other</option></select></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Size<select name="packageSize" className={controlClass}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Weight in grams <span className="font-normal text-slate">(optional)</span><input name="weightGrams" type="number" min={1} max={100000} inputMode="numeric" className={controlClass} /></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Service level<select name="serviceLevel" className={controlClass}><option value="standard">Standard</option><option value="express">Express</option></select></label>
          </div>
          <label className="grid gap-2 text-sm font-bold text-navy">What is being sent?<textarea required minLength={3} maxLength={500} name="packageDescription" className={`${controlClass} min-h-28 py-3`} placeholder="Describe the parcel clearly for dispatch and the rider" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><Button className="w-full" type="button" variant="outline" onClick={() => moveToStep(1)}>Back</Button><Button className="w-full" type="button" disabled={!pickup.latitude || !destination.latitude} onClick={() => moveToStep(3)}>Continue to payment choices</Button></div>
        </fieldset>

        <fieldset data-step="3" hidden={step !== 3} className="grid gap-5">
          <legend className="text-lg font-extrabold text-navy">Payment choices and final check</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-navy">Who pays?<select name="payer" className={controlClass}><option value="sender">Sender</option><option value="receiver_before_delivery">Receiver before delivery</option><option value="receiver_at_delivery">Receiver at delivery</option></select></label>
            <label className="grid gap-2 text-sm font-bold text-navy">Payment method<select name="paymentMethod" className={controlClass}><option value="online">Online payment</option><option value="bank_transfer">Verified company transfer</option></select></label>
            <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">Discount code <span className="font-normal text-slate">(optional)</span><input name="promotionCode" autoCapitalize="characters" className={`${controlClass} uppercase`} /></label>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>This is a request, not a confirmed booking.</strong> Dovid checks the real route, active coverage, fleet capacity and profitable pricing. The customer must review the secure link and complete any required payment. No account or sign-in is required, and nobody is charged at this step.</div>
          <div className="rounded-2xl bg-cloud p-4 text-sm leading-6 text-navy"><strong>Route:</strong> {pickup.address} → {destination.address}<br/><strong>Customer contact:</strong> stored phone details; email only when supplied.</div>
          <div className="grid gap-3 sm:grid-cols-2"><Button className="w-full" type="button" variant="outline" disabled={pending} onClick={() => moveToStep(2)}>Back</Button><Button className="w-full" disabled={pending} type="submit">{pending ? "Checking route, capacity and pricing…" : "Create request and check availability"}</Button></div>
        </fieldset>
      </form>
    </section>

    {result ? <section role={result.error ? "alert" : "status"} className={`rounded-3xl p-5 shadow-sm sm:p-6 ${resultStyle}`}>
      <p className="font-extrabold">{result.error ?? result.message ?? "Secure customer review link created."}</p>
      {result.quote ? <p className="mt-2 text-sm font-semibold">{formatMoney(result.quote.amountMinor, result.quote.currency)} · {(result.quote.distanceMeters / 1000).toFixed(1)} km road route · {result.quote.duration.replace("s", " seconds")}</p> : null}
      {result.reviewUrl ? <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm font-bold">Secure customer review link<input readOnly value={result.reviewUrl} className={controlClass} /></label>
        <Button className="w-full gap-2 sm:w-auto" type="button" variant="outline" onClick={() => copyText(result.reviewUrl!, "Review link")}><Copy className="size-4" aria-hidden="true"/>Copy review link</Button>
        <div className="rounded-2xl bg-white/70 p-4"><p className="text-sm">Single-use verification code</p><p className="mt-1 text-2xl font-extrabold tracking-[0.18em]">{result.verificationCode}</p><Button className="mt-3 w-full gap-2 sm:w-auto" type="button" variant="outline" onClick={() => copyText(result.verificationCode!, "Verification code")}><Copy className="size-4" aria-hidden="true"/>Copy code</Button></div>
        <p className="text-sm leading-6">Send the link and code only through the customer-controlled contact channel. The code expires quickly.</p>
        {result.whatsappUrl ? <a href={result.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#1c8b49] px-5 py-3 text-sm font-bold text-white"><ExternalLink className="size-4" aria-hidden="true"/>Open manual WhatsApp message</a> : null}
        <p className="text-xs font-semibold">No automated message was sent.</p>
      </div> : null}
    </section> : null}

    <details className="group rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-xl font-extrabold text-navy"><span>Assisted booking queue ({drafts.length})</span><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary>
      <div className="mt-5 grid gap-3">{drafts.map((draft) => <article key={draft.id} className="rounded-2xl bg-cloud p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold text-navy">{draft.customer_name}</p><p className="text-sm text-slate">{draft.booking_origin.replaceAll("_", " ")} · phone ending {draft.customer_phone.slice(-4)}</p><p className="mt-1 break-all text-xs text-slate">{draft.customer_email ? `Email updates: ${draft.customer_email}` : "Email updates not requested"}</p></div><p className="text-sm font-bold capitalize text-orange">{draft.status.replaceAll("_", " ")}</p></div></article>)}{!drafts.length ? <p className="text-slate">No assisted booking drafts yet.</p> : null}</div>
    </details>

    <ActionFeedback feedback={copied ? { text: copied, ok: !copied.startsWith("Could not") } : null} pending={pending} pendingText="Checking the route, capacity and price…" onDismiss={() => setCopied("")} />
  </div>;
}
