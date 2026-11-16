import Link from "next/link";
import { requireRole } from "@/lib/auth/roles";

type RunStop = { id: string; order_id: string | null; stop_type: string; sequence: number; status: string; address: string; estimated_arrival_at: string | null };
type RunAssignment = { id: string; order_id: string; status: string };

export default async function RiderAssignments() {
  const { user, supabase, role } = await requireRole(["rider", "admin"]);
  let runQuery = supabase.from("delivery_runs").select("id,run_reference,status,scheduled_start_at,expected_completion_at,route_distance_meters,route_duration_seconds,delivery_run_stops(id,order_id,stop_type,sequence,status,address,estimated_arrival_at),run_assignments(id,order_id,status)").in("status", ["planned", "active", "paused"]);
  if (role === "rider") runQuery = runQuery.eq("rider_id", user.id);
  let orderQuery = supabase.from("delivery_orders").select("id,order_reference,pickup_address,delivery_address,delivery_status,payment_status,service_level,scheduled_at,created_at").not("delivery_status", "in", "(delivered,cancelled)");
  if (role === "rider") orderQuery = orderQuery.eq("rider_id", user.id);
  const [{ data: runs }, { data: orders }] = await Promise.all([runQuery.order("created_at", { ascending: false }), orderQuery.order("created_at", { ascending: true })]);

  return <>
    <div className="mb-6"><p className="eyebrow">Today&apos;s work</p><h1 className="mt-2 text-3xl font-extrabold text-navy">Rider Dashboard</h1><p className="mt-2 text-sm leading-6 text-slate">See your run, next stop and delivery actions in one place.</p></div>
    <div className="rounded-2xl bg-orange/10 p-4 text-sm font-bold leading-6 text-navy">Only complete a handover when this app confirms payment and delivery proof. Never collect money through a personal account.</div>
    <section className="mt-7">
      <p className="eyebrow">Active delivery run</p>
      <div className="mt-4 grid gap-4">{(runs ?? []).map((run) => {
        const stops = [...((run.delivery_run_stops ?? []) as RunStop[])].sort((left, right) => left.sequence - right.sequence);
        const assignments = (run.run_assignments ?? []) as RunAssignment[];
        const next = stops.find((stop) => ["next", "pending", "arrived"].includes(stop.status));
        const onboard = assignments.filter((assignment) => ["collected", "onboard", "returning"].includes(assignment.status)).length;
        return <article key={run.id} className="min-w-0 rounded-3xl bg-navy p-4 text-white sm:p-6">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0"><h2 className="break-words text-xl font-extrabold sm:text-2xl">{run.run_reference}</h2><p className="mt-1 text-sm capitalize text-white/65">{run.status} · {stops.length} stops · {onboard} parcel{onboard === 1 ? "" : "s"} onboard</p></div>
            {run.expected_completion_at ? <p className="text-sm text-white/70 sm:text-right">Expected completion<br/><strong className="text-white">{new Date(run.expected_completion_at).toLocaleString("en-NG")}</strong></p> : null}
          </div>
          <div className="mt-5 min-w-0 rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-widest text-orange">Next recommended stop</p><p className="mt-2 break-words font-bold">{next ? `${next.stop_type.replaceAll("_", " ")} · ${next.address}` : "No pending stop"}</p></div>
          <ol className="mt-4 grid gap-2">{stops.map((stop) => <li key={stop.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl bg-white/5 p-3 text-sm"><span className="font-bold text-orange">{stop.sequence}</span><span className="min-w-0 break-words capitalize">{stop.stop_type.replaceAll("_", " ")} · {stop.status.replaceAll("_", " ")}<span className="block break-words text-white/60">{stop.address}</span></span></li>)}</ol>
        </article>;
      })}{!runs?.length ? <p className="rounded-3xl bg-white p-6 text-slate sm:p-8">No active delivery run. Your assigned bike remains unavailable until dispatch and safety checks are complete.</p> : null}</div>
    </section>
    <section className="mt-8">
      <h2 className="text-xl font-extrabold text-navy">Today&apos;s assigned deliveries</h2>
      <div className="mt-4 grid gap-4">{orders?.map((order) => <Link key={order.id} href={`/rider/orders/${order.id}`} className="min-w-0 rounded-3xl bg-white p-4 shadow-sm sm:p-6"><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="break-words font-extrabold text-navy">{order.order_reference}</p><p className="mt-3 break-words text-sm leading-6 text-slate">Pickup: {order.pickup_address}<br/>Drop-off: {order.delivery_address}</p></div><div className="sm:text-right"><p className="font-bold capitalize text-orange">{order.delivery_status.replaceAll("_", " ")}</p><p className="mt-1 text-xs capitalize text-slate">Payment: {order.payment_status}</p></div></div></Link>)}{!orders?.length ? <p className="rounded-3xl bg-white p-6 text-slate sm:p-8">No active assignments.</p> : null}</div>
    </section>
  </>;
}
