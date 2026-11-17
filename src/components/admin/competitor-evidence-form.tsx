"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";
import { AddressAutocomplete, type AddressValue } from "@/components/maps/address-autocomplete";

type Option = { id: string; label: string };
type Notice = { context: "source" | "quote"; message: string; ok: boolean } | null;

const blankAddress: AddressValue = { address: "", latitude: "", longitude: "" };
const selectClassName = "min-h-12 w-full rounded-2xl border border-slate/25 bg-white px-4 text-base font-normal text-navy";

function FormNotice({ notice, context }: { notice: Notice; context: "source" | "quote" }) {
  if (!notice || notice.context !== context) return null;
  return (
    <p
      role={notice.ok ? "status" : "alert"}
      className={`rounded-2xl p-4 text-sm font-semibold leading-6 ${notice.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}
    >
      {notice.message}
    </p>
  );
}

export function CompetitorEvidenceForm({ competitors, serviceAreas }: { competitors: Option[]; serviceAreas: Option[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<"source" | "quote" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pickup, setPickup] = useState<AddressValue>(blankAddress);
  const [dropoff, setDropoff] = useState<AddressValue>(blankAddress);

  async function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending("source");
    setNotice(null);
    try {
      const response = await fetch("/api/admin/pricing/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          website: form.get("website") || undefined,
          city: form.get("city"),
          serviceCoverage: form.get("serviceCoverage") || undefined,
          deliveryCategory: form.get("deliveryCategory"),
          pricingModel: form.get("pricingModel") || undefined,
          sourceUrl: form.get("sourceUrl") || undefined,
          sourceType: form.get("sourceType"),
          verificationStatus: "unverified",
          notes: form.get("notes") || undefined,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "We could not save this competitor source.");
      formElement.reset();
      setNotice({ context: "source", ok: true, message: "Competitor source saved as unverified. Add a route quote when you have evidence to check." });
      router.refresh();
    } catch (error) {
      setNotice({ context: "source", ok: false, message: error instanceof Error ? error.message : "We could not save this competitor source." });
    } finally {
      setPending(null);
    }
  }

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pickup.latitude || !pickup.longitude || !dropoff.latitude || !dropoff.longitude) {
      setNotice({ context: "quote", ok: false, message: "Choose both addresses from the suggestions so we can confirm and measure the route." });
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending("quote");
    setNotice(null);
    try {
      const response = await fetch("/api/admin/pricing/competitors/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorId: form.get("competitorId"),
          serviceAreaId: form.get("serviceAreaId"),
          pickupAddress: pickup.address,
          pickupCoordinates: { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) },
          dropoffAddress: dropoff.address,
          dropoffCoordinates: { latitude: Number(dropoff.latitude), longitude: Number(dropoff.longitude) },
          packageCategory: form.get("packageCategory"),
          serviceLevel: form.get("serviceLevel"),
          quotedTotalKobo: Math.round(Number(form.get("quotedTotal")) * 100),
          taxIncluded: null,
          surchargesKobo: 0,
          quotedAt: new Date(String(form.get("quotedAt"))).toISOString(),
          evidenceUrl: form.get("evidenceUrl") || undefined,
          verificationMethod: form.get("verificationMethod"),
          verificationStatus: form.get("verified") === "on" ? "verified" : "unverified",
          comparable: form.get("comparable") === "on",
          notes: form.get("quoteNotes") || undefined,
        }),
      });
      const body = await response.json() as { error?: string; roadDistanceMeters?: number };
      if (!response.ok) throw new Error(body.error ?? "We could not save this route quote.");
      const distance = typeof body.roadDistanceMeters === "number" ? ` The road route measured ${(body.roadDistanceMeters / 1_000).toFixed(1)} km.` : "";
      formElement.reset();
      setPickup(blankAddress);
      setDropoff(blankAddress);
      setNotice({ context: "quote", ok: true, message: `Route quote saved.${distance}` });
      router.refresh();
    } catch (error) {
      setNotice({ context: "quote", ok: false, message: error instanceof Error ? error.message : "We could not save this route quote." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={submitSource} className="grid content-start gap-5 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-xl font-extrabold text-navy">Add a competitor</h2>
          <p className="mt-2 text-sm leading-6 text-slate">Save where the pricing evidence came from. It will remain unverified until someone checks it.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Competitor name" required />
          <Field name="city" label="City" defaultValue="Ibadan" required />
          <Field name="website" label="Website (optional)" type="url" />
          <Field name="sourceUrl" label="Evidence link (optional)" type="url" />
          <Field name="deliveryCategory" label="Delivery type" defaultValue="Motorcycle parcel" required />
          <label className="grid gap-2 text-sm font-semibold text-navy">
            <span>Where did the evidence come from?</span>
            <select name="sourceType" className={selectClassName}>
              <option value="website">Website</option>
              <option value="manual_quote">Quote requested manually</option>
              <option value="csv_import">Imported file</option>
              <option value="approved_provider">Approved provider</option>
            </select>
          </label>
        </div>
        <TextareaField name="serviceCoverage" label="Areas they say they cover (optional)" />
        <TextareaField name="pricingModel" label="How they describe their pricing (optional)" />
        <TextareaField name="notes" label="Internal notes (optional)" />
        <Button type="submit" disabled={pending !== null} className="w-full sm:w-auto">
          {pending === "source" ? "Saving competitor…" : "Save competitor"}
        </Button>
        <FormNotice notice={notice} context="source" />
      </form>

      <form onSubmit={submitQuote} className="grid content-start gap-5 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-xl font-extrabold text-navy">Add a quoted delivery</h2>
          <p className="mt-2 text-sm leading-6 text-slate">Choose the same addresses used for the quote. We will confirm them and measure the road route automatically.</p>
        </div>
        {competitors.length && serviceAreas.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-navy">
                <span>Competitor</span>
                <select required name="competitorId" className={selectClassName}>
                  {competitors.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-navy">
                <span>Coverage area</span>
                <select required name="serviceAreaId" className={selectClassName}>
                  {serviceAreas.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <AddressAutocomplete label="Pickup address" value={pickup} onChange={setPickup} />
            <AddressAutocomplete label="Destination address" value={dropoff} onChange={setDropoff} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="quotedTotal" label="Quoted price (NGN)" type="number" min="1" step="1" required />
              <Field name="packageCategory" label="Package type" defaultValue="Small parcel" required />
              <label className="grid gap-2 text-sm font-semibold text-navy">
                <span>Delivery speed</span>
                <select name="serviceLevel" className={selectClassName}>
                  <option value="standard">Standard</option>
                  <option value="express">Express</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </label>
              <Field name="quotedAt" label="When was the quote given?" type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} required />
              <Field name="evidenceUrl" label="Link to screenshot or evidence" type="url" required />
              <Field name="verificationMethod" label="How was it checked?" placeholder="For example, checkout screenshot" required />
            </div>
            <div className="grid gap-3 rounded-2xl bg-cloud p-4 text-sm font-semibold text-navy">
              <label className="flex min-h-11 items-center gap-3">
                <input name="verified" type="checkbox" className="size-5 shrink-0" />
                I checked the quote against its evidence
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input name="comparable" type="checkbox" className="size-5 shrink-0" />
                The route and service are comparable to Dovid
              </label>
            </div>
            <TextareaField name="quoteNotes" label="Internal notes (optional)" />
            <Button type="submit" disabled={pending !== null || !pickup.latitude || !dropoff.latitude} className="w-full sm:w-auto">
              {pending === "quote" ? "Checking route and saving…" : "Check route and save quote"}
            </Button>
            <FormNotice notice={notice} context="quote" />
          </>
        ) : (
          <p className="rounded-2xl bg-cloud p-5 text-sm leading-6 text-slate">Add a competitor source and keep the Ibadan service area configured before recording route quotes.</p>
        )}
      </form>
    </div>
  );
}
