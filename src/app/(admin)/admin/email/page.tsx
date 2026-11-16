import { redirect } from "next/navigation";
import { getStaffAuthorization } from "@/lib/auth/staff";

export const dynamic = "force-dynamic";

function level(percentage: number) {
  if (percentage >= 95) return { label: "Critical", className: "bg-red-50 text-red-800" };
  if (percentage >= 85) return { label: "High", className: "bg-orange/10 text-orange-dark" };
  if (percentage >= 70) return { label: "Watch", className: "bg-amber-50 text-amber-800" };
  return { label: "Normal", className: "bg-emerald-50 text-emerald-800" };
}

export default async function EmailDeliveryPage() {
  const auth = await getStaffAuthorization("reports.view");
  if (!auth) redirect("/admin");
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [{ count: daily }, { count: monthly }, { count: queued }, { count: failed }, { data: latestEvent }] = await Promise.all([
    auth.admin.from("email_provider_events").select("id", { count: "exact", head: true }).eq("event_type", "email.sent").gte("received_at", dayStart),
    auth.admin.from("email_provider_events").select("id", { count: "exact", head: true }).eq("event_type", "email.sent").gte("received_at", monthStart),
    auth.admin.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "email").in("status", ["queued", "sending"]),
    auth.admin.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "email").eq("status", "failed"),
    auth.admin.from("email_provider_events").select("event_type,received_at").order("received_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  const dailyPercentage = Math.round(((daily ?? 0) / 100) * 100);
  const monthlyPercentage = Math.round(((monthly ?? 0) / 3000) * 100);
  const dailyLevel = level(dailyPercentage);
  const monthlyLevel = level(monthlyPercentage);

  return <>
    <p className="eyebrow">Transactional email</p>
    <h1 className="mt-2 text-3xl font-extrabold text-navy">Email delivery</h1>
    <p className="mt-3 max-w-3xl text-slate">Monitor Resend delivery events and the application queue. Counts include Supabase Auth messages after the shared Resend webhook is connected.</p>
    <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">Today</p><p className="mt-2 text-3xl font-extrabold text-navy">{daily ?? 0}<span className="text-base text-slate"> / 100</span></p><span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold ${dailyLevel.className}`}>{dailyLevel.label} · {dailyPercentage}%</span></article>
      <article className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">This month</p><p className="mt-2 text-3xl font-extrabold text-navy">{monthly ?? 0}<span className="text-base text-slate"> / 3,000</span></p><span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold ${monthlyLevel.className}`}>{monthlyLevel.label} · {monthlyPercentage}%</span></article>
      <article className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">Waiting to send</p><p className="mt-2 text-3xl font-extrabold text-navy">{queued ?? 0}</p><p className="mt-3 text-xs text-slate">Claimed atomically by the scheduled worker.</p></article>
      <article className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">Needs attention</p><p className="mt-2 text-3xl font-extrabold text-navy">{failed ?? 0}</p><p className="mt-3 text-xs text-slate">Retryable failures remain scheduled automatically.</p></article>
    </div>
    <section className="mt-6 rounded-3xl bg-white p-5 sm:p-6"><h2 className="text-xl font-extrabold text-navy">Provider connection</h2>{latestEvent ? <p className="mt-3 break-words text-sm text-slate">Latest signed event: <strong className="text-navy">{latestEvent.event_type}</strong> at {new Date(latestEvent.received_at).toLocaleString("en-GB")}.</p> : <p className="mt-3 text-sm leading-6 text-slate">No signed Resend event has been received yet. Domain, SMTP, API key and webhook configuration must be completed before email is operational.</p>}</section>
  </>;
}
