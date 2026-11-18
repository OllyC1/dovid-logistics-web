"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { formatMoney } from "@/lib/utils";

type Promotion = { id: string; code: string; kind: "fixed" | "percentage" | "fixed_price"; value: number; maximum_discount_kobo: number | null; active: boolean; starts_at: string; ends_at: string | null };

function description(promotion: Promotion) {
  if (promotion.kind === "percentage") return `${promotion.value / 100}% off`;
  if (promotion.kind === "fixed_price") return `Customer price target ${formatMoney(promotion.value)}`;
  return `${formatMoney(promotion.value)} off`;
}

export function PromotionManager({ promotions: initialPromotions }: { promotions: Promotion[] }) {
  const [promotions, setPromotions] = useState(initialPromotions);
  const [kind, setKind] = useState<Promotion["kind"]>("percentage");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [toggle, setToggle] = useState<Promotion | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayedValue = Number(form.get("value"));
    const startsAt = new Date(String(form.get("startsAt")));
    const ends = String(form.get("endsAt") ?? "");
    setPending(true); setMessage("");
    const response = await fetch("/api/admin/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: form.get("code"), kind, value: Math.round(displayedValue * (kind === "percentage" ? 100 : 100)), maximumDiscountKobo: form.get("maximumDiscount") ? Math.round(Number(form.get("maximumDiscount")) * 100) : null, startsAt: startsAt.toISOString(), endsAt: ends ? new Date(ends).toISOString() : null }) });
    const body = await response.json().catch(() => ({}));
    setPending(false); setMessage(response.ok ? `Code ${body.code} was created inactive. Review it below, then activate it deliberately.` : body.error ?? "The promotion could not be created.");
    if (response.ok) {
      setPromotions((current) => [body as Promotion, ...current.filter((promotion) => promotion.id !== body.id)]);
      event.currentTarget.reset();
    }
  }

  async function changeActive(reason: string) {
    if (!toggle) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/promotions/${toggle.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !toggle.active, reason }) });
    const body = await response.json().catch(() => ({}));
    setPending(false); setToggle(null); setMessage(response.ok ? `Code ${toggle.code} is now ${body.active ? "active" : "inactive"}.` : body.error ?? "The promotion could not be changed.");
    if (response.ok) {
      setPromotions((current) => current.map((promotion) => promotion.id === toggle.id ? { ...promotion, active: Boolean(body.active) } : promotion));
    }
  }

  return <div className="grid gap-6"><details className="group rounded-3xl bg-white p-4 shadow-sm sm:p-6"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-xl font-extrabold text-navy"><span>Create a checkout discount code</span><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary><form onSubmit={create} className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="code" label="Discount code" placeholder="WELCOME20" pattern="[A-Za-z0-9_-]{3,40}" required /><label className="grid gap-2 text-sm font-semibold text-navy"><span>Discount type</span><select value={kind} onChange={(event) => setKind(event.target.value as Promotion["kind"])} className="min-h-12 rounded-2xl border border-slate/25 bg-white px-4"><option value="percentage">Percentage off</option><option value="fixed">Fixed amount off</option><option value="fixed_price">Set customer price</option></select></label><Field name="value" label={kind === "percentage" ? "Percentage (0.01–100)" : kind === "fixed_price" ? "Customer pays (NGN)" : "Amount off (NGN)"} type="number" min={kind === "percentage" ? "0.01" : "1"} max={kind === "percentage" ? "100" : undefined} step={kind === "percentage" ? "0.01" : "1"} required /><Field name="maximumDiscount" label="Maximum discount (NGN, optional)" type="number" min="1" step="1" /><Field name="startsAt" label="Starts" type="datetime-local" required /><Field name="endsAt" label="Ends (optional)" type="datetime-local" /><p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950 sm:col-span-2">The code starts inactive. The pricing engine will never reduce a quote below the approved profitability floor, even for a 100% discount or a low fixed customer price.</p><Button type="submit" disabled={pending} className="sm:col-span-2">{pending ? "Saving discount code…" : "Create inactive discount code"}</Button></form></details>{message ? <p role="status" className="rounded-2xl bg-cloud p-4 text-sm font-semibold text-navy">{message}</p> : null}<section><h2 className="text-xl font-extrabold text-navy">Configured discount codes</h2><div className="mt-4 grid gap-4">{promotions.map((promotion) => <details key={promotion.id} className="group rounded-3xl bg-white p-5 shadow-sm"><summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-4"><div><h3 className="text-lg font-extrabold text-navy">{promotion.code}</h3><p className="mt-1 text-sm text-slate">{description(promotion)} · {promotion.active ? "Active" : "Inactive"}</p></div><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary><div className="mt-4 border-t border-navy/8 pt-4 text-sm leading-6 text-slate"><p>Runs {new Date(promotion.starts_at).toLocaleString("en-NG")} {promotion.ends_at ? `to ${new Date(promotion.ends_at).toLocaleString("en-NG")}` : "with no end date"}.</p>{promotion.maximum_discount_kobo ? <p>Maximum discount: {formatMoney(promotion.maximum_discount_kobo)}</p> : null}<Button type="button" variant={promotion.active ? "ghost" : "outline"} disabled={pending} className="mt-4 w-full sm:w-auto" onClick={() => setToggle(promotion)}>{promotion.active ? "Deactivate code" : "Activate code"}</Button></div></details>)}{!promotions.length ? <p className="rounded-3xl bg-white p-6 text-slate">No discount codes configured.</p> : null}</div></section><ReasonDialog open={Boolean(toggle)} title={`${toggle?.active ? "Deactivate" : "Activate"} ${toggle?.code ?? "this code"}?`} description="This affects future quotes only. Record the approved business reason." confirmLabel={toggle?.active ? "Deactivate code" : "Activate code"} pending={pending} onCancel={() => setToggle(null)} onConfirm={changeActive}/></div>;
}
