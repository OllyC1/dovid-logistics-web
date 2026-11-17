import { ActivateRateCardButton } from "@/components/admin/activate-rate-card-button";
import { RateCardForm } from "@/components/admin/rate-card-form";
import { RateCardActions } from "@/components/admin/rate-card-actions";
import { requirePricingManager as requireRole } from "@/lib/auth/staff";
import { formatMoney } from "@/lib/utils";

function distanceLabel(minimumMeters: number, maximumMeters: number | null) {
  const minimum = (minimumMeters / 1000).toFixed(1);
  const maximum = maximumMeters === null ? "+" : (maximumMeters / 1000).toFixed(1);
  return `${minimum}–${maximum} km`;
}

export default async function RateCardsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { supabase } = await requireRole(["admin"]);
  const { edit } = await searchParams;
  const [{ data: cards }, { data: versions }, { data: areas }] = await Promise.all([
    supabase.from("rate_cards").select("id,name,service_level,provisional,active,effective_at,configuration_version_id,rate_card_bands(*)").order("effective_at", { ascending: false }),
    supabase.from("pricing_configuration_versions").select("id,version,status").in("status", ["draft", "scheduled", "active"]).order("version", { ascending: false }),
    supabase.from("service_areas").select("id,name").eq("active", true).order("name"),
  ]);
  const latestBands = cards?.[0]?.rate_card_bands?.map((band) => ({
    minimumDistanceMeters: band.minimum_distance_meters,
    maximumDistanceMeters: band.maximum_distance_meters,
    priceKobo: band.price_kobo,
    additionalPerKilometerKobo: band.additional_per_kilometer_kobo,
  })) ?? undefined;
  const editingCard = cards?.find((card) => card.id === edit);
  const editingBands = editingCard?.rate_card_bands?.sort((left, right) => left.position - right.position).map((band) => ({ minimumDistanceMeters: band.minimum_distance_meters, maximumDistanceMeters: band.maximum_distance_meters, priceKobo: band.price_kobo, additionalPerKilometerKobo: band.additional_per_kilometer_kobo }));

  return <>
    <h1 className="text-3xl font-extrabold text-navy">Rate cards</h1>
    <p className="mt-3 text-slate">Create immutable versions, preview published rates, then explicitly activate an approved card.</p>
    <details id="rate-card-editor" className="group mt-7 rounded-3xl bg-white p-4 sm:p-6" open={Boolean(editingCard)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-xl font-extrabold text-navy"><span>{editingCard ? `Create a corrected version of ${editingCard.name}` : "Create a rate-card version"}</span><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary>
      <p className="mt-3 text-sm leading-6 text-slate">Editing creates a new inactive version so quotes and orders keep the exact rates they originally used. Choose the service level here; activation applies that card to the selected level and area.</p>
      <div className="mt-6"><RateCardForm versions={versions?.map((version) => ({ id: version.id, label: `Version ${version.version} · ${version.status}` })) ?? []} serviceAreas={areas?.map((area) => ({ id: area.id, label: area.name })) ?? []} initialBands={editingBands ?? latestBands} initialName={editingCard?.name} initialServiceLevel={(editingCard?.service_level as "standard" | "express" | "scheduled" | undefined) ?? "standard"} editing={Boolean(editingCard)} /></div>
    </details>
    <div className="mt-7 grid gap-6">{cards?.map((card) => {
      const sortedBands = [...(card.rate_card_bands ?? [])].sort((left, right) => left.position - right.position);
      return <details key={card.id} className="group min-w-0 rounded-3xl bg-white p-4 sm:p-6">
        <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-4"><div className="min-w-0"><h2 className="break-words text-xl font-extrabold text-navy">{card.name}</h2><p className="mt-1 text-xs font-bold uppercase tracking-wider text-orange">{card.service_level} · {card.provisional ? "Provisional" : "Approved"} · {card.active ? "Active" : "Inactive"}</p></div><span aria-hidden="true" className="shrink-0 text-2xl text-orange transition group-open:rotate-45">+</span></summary>
        <div className="mt-5 grid gap-4 border-t border-navy/8 pt-5 sm:flex sm:items-start sm:justify-between">
          <div className="min-w-0"><h2 className="break-words text-xl font-extrabold text-navy">{card.name}</h2><p className="mt-1 text-xs font-bold uppercase tracking-wider text-orange">{card.provisional ? "Provisional planning rates" : "Approved operational rates"} · {card.active ? "Active" : "Inactive"}</p></div>
          <div className="grid gap-2">{card.active ? <span className="w-fit rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Live</span> : <ActivateRateCardButton id={card.id} />}<RateCardActions id={card.id} active={card.active} /></div>
        </div>
        <div className="mt-5 grid gap-3 sm:hidden">{sortedBands.map((band) => <section key={band.id} className="rounded-2xl bg-cloud p-4">
          <h3 className="font-extrabold text-navy">{distanceLabel(band.minimum_distance_meters, band.maximum_distance_meters)}</h3>
          <dl className="mt-3 grid gap-3 text-sm">
            <div><dt className="text-xs text-slate">Customer price</dt><dd className="mt-1 font-bold text-navy">{formatMoney(band.price_kobo)}</dd></div>
            <div><dt className="text-xs text-slate">Beyond-band rate</dt><dd className="mt-1 font-bold text-navy">{band.additional_per_kilometer_kobo ? `${formatMoney(band.additional_per_kilometer_kobo)}/km` : "Not applicable"}</dd></div>
          </dl>
        </section>)}</div>
        <div className="mt-5 hidden overflow-x-auto sm:block"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="text-slate"><th className="py-3">Distance</th><th>Customer price</th><th>Beyond-band rate</th></tr></thead><tbody>{sortedBands.map((band) => <tr key={band.id} className="border-t border-navy/8"><td className="py-3">{distanceLabel(band.minimum_distance_meters, band.maximum_distance_meters)}</td><td>{formatMoney(band.price_kobo)}</td><td>{band.additional_per_kilometer_kobo ? `${formatMoney(band.additional_per_kilometer_kobo)}/km` : "—"}</td></tr>)}</tbody></table></div>
      </details>;
    })}</div>
  </>;
}
