"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatMoney } from "@/lib/utils";

type Band = { minimumDistanceMeters: number; maximumDistanceMeters: number | null; priceKobo: number; additionalPerKilometerKobo: number | null };
type Option = { id: string; label: string };

const fallbackBands: Band[] = [
  { minimumDistanceMeters: 0, maximumDistanceMeters: 3000, priceKobo: 180000, additionalPerKilometerKobo: null },
  { minimumDistanceMeters: 3001, maximumDistanceMeters: 5000, priceKobo: 200000, additionalPerKilometerKobo: null },
  { minimumDistanceMeters: 5001, maximumDistanceMeters: 8000, priceKobo: 230000, additionalPerKilometerKobo: null },
  { minimumDistanceMeters: 8001, maximumDistanceMeters: 12000, priceKobo: 270000, additionalPerKilometerKobo: null },
  { minimumDistanceMeters: 12001, maximumDistanceMeters: 17000, priceKobo: 330000, additionalPerKilometerKobo: null },
  { minimumDistanceMeters: 17001, maximumDistanceMeters: 22000, priceKobo: 400000, additionalPerKilometerKobo: null },
  { minimumDistanceMeters: 22001, maximumDistanceMeters: null, priceKobo: 400000, additionalPerKilometerKobo: 22000 }
];

export function RateCardForm({ versions, serviceAreas, initialBands, initialName = "Ibadan standard rates", initialServiceLevel = "standard", editing = false }: { versions: Option[]; serviceAreas: Option[]; initialBands?: Band[]; initialName?: string; initialServiceLevel?: "standard" | "express" | "scheduled"; editing?: boolean }) {
  const router = useRouter();
  const [bands, setBands] = useState(initialBands?.length ? initialBands : fallbackBands);
  const [distanceKm, setDistanceKm] = useState(8);
  const [state, setState] = useState({ pending: false, message: "", ok: false });
  const preview = useMemo(() => {
    const meters = Math.round(distanceKm * 1000);
    const band = bands.find(item => meters >= item.minimumDistanceMeters && (item.maximumDistanceMeters === null || meters <= item.maximumDistanceMeters));
    if (!band) return null;
    const extraMeters = band.maximumDistanceMeters === null ? Math.max(0, meters - band.minimumDistanceMeters + 1) : 0;
    return band.priceKobo + Math.ceil(extraMeters / 1000) * (band.additionalPerKilometerKobo ?? 0);
  }, [bands, distanceKm]);

  function updateBand(index: number, key: keyof Band, raw: string) {
    setBands(current => current.map((band, position) => position === index ? { ...band, [key]: raw === "" && (key === "maximumDistanceMeters" || key === "additionalPerKilometerKobo") ? null : Math.round(Number(raw) * (key.toLowerCase().includes("kobo") ? 100 : 1000)) } : band));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ pending: true, message: "", ok: false });
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/pricing/rate-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configurationVersionId: form.get("configurationVersionId"), serviceAreaId: form.get("serviceAreaId") || null, name: form.get("name"), serviceLevel: form.get("serviceLevel"), provisional: form.get("provisional") === "on", effectiveAt: new Date(String(form.get("effectiveAt"))).toISOString(), bands }) });
    const body = await response.json();
    setState({ pending: false, message: response.ok ? "Inactive rate-card version created. Review and activate it below." : body.error, ok: response.ok });
    if (response.ok) router.refresh();
  }

  return <form onSubmit={submit} className="grid gap-6">
    <div className="grid gap-4 md:grid-cols-2">
      <Field name="name" label="Rate card name" defaultValue={editing ? `${initialName} · revised` : initialName} required />
      <label className="grid gap-2 text-sm font-semibold text-navy"><span>Configuration version</span><select name="configurationVersionId" required className="min-h-12 rounded-2xl border border-slate/25 bg-white px-4 font-normal">{versions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold text-navy"><span>Service area</span><select name="serviceAreaId" className="min-h-12 rounded-2xl border border-slate/25 bg-white px-4 font-normal"><option value="">All configured areas</option>{serviceAreas.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold text-navy"><span>Service level</span><select name="serviceLevel" defaultValue={initialServiceLevel} className="min-h-12 rounded-2xl border border-slate/25 bg-white px-4 font-normal"><option value="standard">Standard</option><option value="express">Express</option><option value="scheduled">Scheduled</option></select></label>
      <Field name="effectiveAt" label="Effective from" type="datetime-local" required />
      <label className="flex items-center gap-3 pt-7 text-sm font-semibold text-navy"><input name="provisional" type="checkbox" defaultChecked /> Mark as provisional</label>
    </div>
    <div className="grid gap-3 sm:hidden">
      <p className="text-sm font-extrabold text-navy">Distance bands</p>
      {bands.map((band,index)=><fieldset key={index} className="grid gap-3 rounded-2xl border border-navy/10 p-4"><legend className="px-2 text-sm font-extrabold text-orange">Band {index+1}</legend>
        <label className="grid gap-1 text-xs font-bold text-slate">Minimum km<input aria-label={`Band ${index+1} minimum km`} className="min-h-11 w-full rounded-xl border p-3 text-base font-normal text-navy" type="number" min="0" step="0.001" value={band.minimumDistanceMeters/1000} onChange={event=>updateBand(index,"minimumDistanceMeters",event.target.value)}/></label>
        <label className="grid gap-1 text-xs font-bold text-slate">Maximum km<input aria-label={`Band ${index+1} maximum km`} className="min-h-11 w-full rounded-xl border p-3 text-base font-normal text-navy" type="number" min="0" step="0.001" value={band.maximumDistanceMeters===null?"":band.maximumDistanceMeters/1000} placeholder="Open" onChange={event=>updateBand(index,"maximumDistanceMeters",event.target.value)}/></label>
        <label className="grid gap-1 text-xs font-bold text-slate">Base price NGN<input aria-label={`Band ${index+1} price`} className="min-h-11 w-full rounded-xl border p-3 text-base font-normal text-navy" type="number" min="0" step="1" value={band.priceKobo/100} onChange={event=>updateBand(index,"priceKobo",event.target.value)}/></label>
        <label className="grid gap-1 text-xs font-bold text-slate">Extra NGN/km<input aria-label={`Band ${index+1} extra rate`} className="min-h-11 w-full rounded-xl border p-3 text-base font-normal text-navy" type="number" min="0" step="1" value={band.additionalPerKilometerKobo===null?"":band.additionalPerKilometerKobo/100} placeholder="None" onChange={event=>updateBand(index,"additionalPerKilometerKobo",event.target.value)}/></label>
      </fieldset>)}
    </div>
    <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="text-slate"><th className="pb-3">Minimum km</th><th>Maximum km</th><th>Base price NGN</th><th>Extra NGN/km</th></tr></thead><tbody>{bands.map((band,index)=><tr key={index} className="border-t border-navy/8"><td className="py-2"><input aria-label={`Band ${index+1} minimum km`} className="w-32 rounded-xl border p-2" type="number" min="0" step="0.001" value={band.minimumDistanceMeters/1000} onChange={event=>updateBand(index,"minimumDistanceMeters",event.target.value)}/></td><td><input aria-label={`Band ${index+1} maximum km`} className="w-32 rounded-xl border p-2" type="number" min="0" step="0.001" value={band.maximumDistanceMeters===null?"":band.maximumDistanceMeters/1000} placeholder="Open" onChange={event=>updateBand(index,"maximumDistanceMeters",event.target.value)}/></td><td><input aria-label={`Band ${index+1} price`} className="w-36 rounded-xl border p-2" type="number" min="0" step="1" value={band.priceKobo/100} onChange={event=>updateBand(index,"priceKobo",event.target.value)}/></td><td><input aria-label={`Band ${index+1} extra rate`} className="w-36 rounded-xl border p-2" type="number" min="0" step="1" value={band.additionalPerKilometerKobo===null?"":band.additionalPerKilometerKobo/100} placeholder="None" onChange={event=>updateBand(index,"additionalPerKilometerKobo",event.target.value)}/></td></tr>)}</tbody></table></div>
    <div className="grid gap-4 rounded-2xl bg-cloud p-5 sm:grid-cols-2 sm:items-end"><Field label="Preview route distance (km)" type="number" min="0" step="0.1" value={distanceKm} onChange={event=>setDistanceKm(Number(event.target.value))}/><div><p className="text-sm text-slate">Published rate-card preview</p><p className="text-2xl font-extrabold text-navy">{preview===null?"No matching band":formatMoney(preview)}</p><p className="text-xs text-slate">Profitability protection is applied separately by the quote engine.</p></div></div>
    {state.message ? <p role="status" className={`rounded-2xl p-4 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p> : null}
    <Button type="submit" disabled={state.pending || versions.length===0}>{state.pending ? "Creating…" : editing ? "Create corrected inactive version" : "Create inactive version"}</Button>
  </form>;
}
