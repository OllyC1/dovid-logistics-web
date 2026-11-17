import { CompetitorEvidenceForm } from "@/components/admin/competitor-evidence-form";
import { requirePricingManager as requireRole } from "@/lib/auth/staff";
import { formatMoney } from "@/lib/utils";

type CompetitorQuote = {
  id: string;
  quoted_total_kobo: number;
  road_distance_meters: number;
  service_level: string;
  verification_status: string;
  comparable: boolean;
  evidence_url: string | null;
  competitors: unknown;
};

function competitorName(quote: CompetitorQuote) {
  return (quote.competitors as { name?: string } | null)?.name ?? "Unknown";
}

export default async function CompetitorsPage() {
  const { supabase } = await requireRole(["admin"]);
  const [{ data: quotes }, { data: competitors }, { data: areas }] = await Promise.all([
    supabase.from("competitor_quotes").select("id,quoted_total_kobo,road_distance_meters,service_level,quoted_at,verification_status,comparable,evidence_url,competitors(name)").order("quoted_at", { ascending: false }).limit(100),
    supabase.from("competitors").select("id,name,verification_status").order("name"),
    supabase.from("service_areas").select("id,name").eq("active", true).order("name"),
  ]);
  const quoteRows = (quotes ?? []) as CompetitorQuote[];

  return <>
    <h1 className="text-3xl font-extrabold text-navy">Competitor pricing</h1>
    <p className="mt-3 max-w-3xl text-slate">Only verified, fresh, route-comparable evidence can influence automated pricing. Published starting prices never substitute for route quotes.</p>
    <div className="mt-7"><CompetitorEvidenceForm competitors={competitors?.map((item) => ({ id: item.id, label: `${item.name} · ${item.verification_status}` })) ?? []} serviceAreas={areas?.map((area) => ({ id: area.id, label: area.name })) ?? []} /></div>

    <details className="group mt-7 rounded-3xl bg-white p-5"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-xl font-extrabold text-navy"><span>Competitor directory ({competitors?.length ?? 0})</span><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{competitors?.map((competitor) => <article key={competitor.id} className="rounded-2xl bg-cloud p-4"><h3 className="font-extrabold text-navy">{competitor.name}</h3><p className="mt-1 text-sm capitalize text-slate">{competitor.verification_status.replaceAll("_", " ")}</p></article>)}{!competitors?.length ? <p className="text-sm text-slate">No competitors recorded.</p> : null}</div></details>

    <details className="group mt-7" aria-labelledby="competitor-quotes-heading">
      <summary id="competitor-quotes-heading" className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-3xl bg-white p-5 text-xl font-extrabold text-navy"><span>Recorded competitor route quotes ({quoteRows.length})</span><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary>
      <div className="grid gap-3 sm:hidden">
        {quoteRows.map((quote) => <article key={quote.id} className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4"><h3 className="font-extrabold text-navy">{competitorName(quote)}</h3><p className="shrink-0 font-extrabold text-orange">{formatMoney(quote.quoted_total_kobo)}</p></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate">Route</dt><dd className="mt-1 font-bold text-navy">{(quote.road_distance_meters / 1000).toFixed(1)} km</dd></div>
            <div><dt className="text-xs text-slate">Service</dt><dd className="mt-1 font-bold capitalize text-navy">{quote.service_level}</dd></div>
            <div><dt className="text-xs text-slate">Verification</dt><dd className="mt-1 font-bold capitalize text-navy">{quote.verification_status}</dd></div>
            <div><dt className="text-xs text-slate">Comparable</dt><dd className="mt-1 font-bold text-navy">{quote.comparable ? "Yes" : "No"}</dd></div>
          </dl>
          {quote.evidence_url ? <a className="mt-4 inline-flex min-h-11 items-center font-bold text-orange" href={quote.evidence_url} rel="noreferrer" target="_blank">Open evidence source</a> : <p className="mt-4 text-xs text-slate">No evidence link recorded.</p>}
        </article>)}
      </div>
      <div className="hidden overflow-x-auto rounded-3xl bg-white p-6 sm:block">
        <table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="text-slate"><th className="pb-4">Competitor</th><th>Route</th><th>Quote</th><th>Service</th><th>Verified</th><th>Comparable</th><th>Evidence</th></tr></thead><tbody>{quoteRows.map((quote) => <tr key={quote.id} className="border-t border-navy/8"><td className="py-4 font-bold text-navy">{competitorName(quote)}</td><td>{(quote.road_distance_meters / 1000).toFixed(1)} km</td><td>{formatMoney(quote.quoted_total_kobo)}</td><td className="capitalize">{quote.service_level}</td><td className="capitalize">{quote.verification_status}</td><td>{quote.comparable ? "Yes" : "No"}</td><td>{quote.evidence_url ? <a className="font-bold text-orange" href={quote.evidence_url} rel="noreferrer" target="_blank">Open source</a> : "—"}</td></tr>)}</tbody></table>
      </div>
      {!quoteRows.length ? <p className="rounded-3xl bg-white px-5 py-8 text-center text-slate">No competitor quotes recorded. The approved Dovid rate card remains authoritative.</p> : null}
    </details>
  </>;
}
