import { requireRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/utils";

export default async function OperationsReportsPage() {
  await requireRole(["admin"]);
  const admin = createSupabaseAdminClient();
  const [{ data: zones }, { data: orders }, { data: requests }, { data: assignments }, { data: vehicles }, { data: costs }, { data: deliveredEvents }, { data: runs }, { data: runAssignments }, { data: expenses }, { data: surcharges }, { data: attempts }, { data: redeliveries }, { data: assistedDrafts }, { data: transactions }] = await Promise.all([
    admin.from("service_zones").select("id,code,name"),
    admin.from("delivery_orders").select("id,pickup_zone_id,delivery_zone_id,distance_meters,created_at,quote_id,delivery_status,rider_id,booking_origin,quoted_amount_minor"),
    admin.from("delivery_availability_requests").select("decision,reason_code,status"),
    admin.from("delivery_assignments").select("rider_id,assigned_at,released_at"),
    admin.from("fleet_vehicles").select("id,code,operational_status"),
    admin.from("quote_cost_estimates").select("quote_id,estimated_profit_kobo"),
    admin.from("delivery_status_events").select("order_id,created_at").eq("new_status", "delivered"),
    admin.from("delivery_runs").select("id,rider_id,total_revenue_kobo,estimated_profit_kobo,status"),
    admin.from("run_assignments").select("run_id,order_id,status"),
    admin.from("delivery_expense_reports").select("order_id,run_id,amount_kobo,status,category"),
    admin.from("customer_surcharges").select("order_id,proposed_amount_kobo,approved_amount_kobo,status,category"),
    admin.from("delivery_attempts").select("order_id,status"),
    admin.from("redelivery_requests").select("order_id,status,charge_attribution"),
    admin.from("assisted_booking_drafts").select("status,booking_origin"),
    admin.from("payment_transactions").select("order_id,amount_minor,status,payment_intents(surcharge_id)"),
  ]);
  const orderRows = orders ?? [];
  const profitByQuote = new Map((costs ?? []).map((cost) => [cost.quote_id, cost.estimated_profit_kobo]));
  const deliveredByOrder = new Map((deliveredEvents ?? []).map((event) => [event.order_id, new Date(event.created_at).getTime()]));
  const zoneRows = (zones ?? []).map((zone) => {
    const matching = orderRows.filter((order) => order.pickup_zone_id === zone.id);
    const fulfilled = matching.map((order) => deliveredByOrder.has(order.id) ? deliveredByOrder.get(order.id)! - new Date(order.created_at).getTime() : null).filter((value): value is number => value !== null);
    return { ...zone, orders: matching.length, averageDistance: matching.length ? matching.reduce((sum, order) => sum + order.distance_meters, 0) / matching.length : 0, averageFulfilmentHours: fulfilled.length ? fulfilled.reduce((sum, value) => sum + value, 0) / fulfilled.length / 3_600_000 : 0, crossZone: matching.filter((order) => order.delivery_zone_id && order.delivery_zone_id !== order.pickup_zone_id).length, estimatedProfit: matching.reduce((sum, order) => sum + (profitByQuote.get(order.quote_id) ?? 0), 0) };
  });
  const activeAssignments = (assignments ?? []).filter((assignment) => !assignment.released_at).length;
  const utilization = (vehicles ?? []).length ? Math.round((activeAssignments / (vehicles ?? []).length) * 100) : 0;
  const reasonCounts = new Map<string, number>();
  for (const request of requests ?? []) reasonCounts.set(request.reason_code, (reasonCounts.get(request.reason_code) ?? 0) + 1);
  const deliveredOrderIds = new Set(orderRows.filter((order) => order.delivery_status === "delivered").map((order) => order.id));
  const attemptedOrderIds = new Set((attempts ?? []).map((attempt) => attempt.order_id));
  const runCount = (runs ?? []).length;
  const completedOrders = deliveredOrderIds.size;
  const recognizedRevenue = (transactions ?? []).filter((transaction) => transaction.status === "paid").reduce((sum, transaction) => sum + transaction.amount_minor, 0);
  const paidExtraRevenue = (transactions ?? []).filter((transaction) => { const intent = Array.isArray(transaction.payment_intents) ? transaction.payment_intents[0] : transaction.payment_intents; return transaction.status === "paid" && Boolean(intent?.surcharge_id); }).reduce((sum, transaction) => sum + transaction.amount_minor, 0);
  const proposedExtraRevenue = (surcharges ?? []).filter((item) => !["paid","rejected","waived"].includes(item.status)).reduce((sum, item) => sum + item.proposed_amount_kobo, 0);
  const approvedExpenses = (expenses ?? []).filter((expense) => expense.status === "approved").reduce((sum, expense) => sum + expense.amount_kobo, 0);
  const firstAttemptSuccess = completedOrders ? Math.round(([...deliveredOrderIds].filter((id) => !attemptedOrderIds.has(id)).length / completedOrders) * 100) : 0;
  const missedRate = orderRows.length ? Math.round((attemptedOrderIds.size / orderRows.length) * 100) : 0;
  const redeliveryRate = orderRows.length ? Math.round((new Set((redeliveries ?? []).map((item) => item.order_id)).size / orderRows.length) * 100) : 0;
  const returnRate = orderRows.length ? Math.round((new Set((attempts ?? []).filter((attempt) => attempt.status === "returned_to_sender").map((attempt) => attempt.order_id)).size / orderRows.length) * 100) : 0;
  const acceptedAssisted = (assistedDrafts ?? []).filter((draft) => ["accepted","order_created"].includes(draft.status)).length;
  const quotedAssisted = (assistedDrafts ?? []).filter((draft) => ["awaiting_customer","accepted","order_created"].includes(draft.status)).length;
  const cards = [
    ["Recognized payments", formatMoney(recognizedRevenue)],
    ["Unpaid proposed charges", formatMoney(proposedExtraRevenue)],
    ["Paid extra-charge revenue", formatMoney(paidExtraRevenue)],
    ["Approved operating expenses", formatMoney(approvedExpenses)],
    ["Parcels per run", runCount ? ((runAssignments ?? []).length / runCount).toFixed(1) : "0"],
    ["Cost per completed delivery", completedOrders ? formatMoney(Math.round(approvedExpenses / completedOrders)) : formatMoney(0)],
    ["First-attempt success", `${firstAttemptSuccess}%`],
    ["Missed-delivery rate", `${missedRate}%`],
    ["Redelivery rate", `${redeliveryRate}%`],
    ["Return-to-sender rate", `${returnRate}%`],
    ["Customer disputes", String((surcharges ?? []).filter((item) => item.status === "disputed").length)],
    ["Assisted quote acceptance", quotedAssisted ? `${Math.round((acceptedAssisted / quotedAssisted) * 100)}%` : "0%"],
  ];
  const channels = ["website","whatsapp_admin","phone_admin","other_admin"].map((origin) => ({ origin, count: orderRows.filter((order) => order.booking_origin === origin).length }));
  return <><p className="eyebrow">Operations monitoring</p><h1 className="mt-2 text-3xl font-extrabold text-navy">Coverage, runs and delivery outcomes</h1><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <article key={label} className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">{label}</p><p className="mt-2 text-2xl font-extrabold text-navy">{value}</p></article>)}</div><div className="mt-8 grid gap-4 sm:grid-cols-3"><article className="rounded-3xl bg-white p-6"><p className="text-sm text-slate">Rider/bike utilization</p><p className="mt-2 text-3xl font-extrabold text-navy">{utilization}%</p></article><article className="rounded-3xl bg-white p-6"><p className="text-sm text-slate">Manual approvals</p><p className="mt-2 text-3xl font-extrabold text-navy">{(requests ?? []).filter((request) => request.status === "approved").length}</p></article><article className="rounded-3xl bg-white p-6"><p className="text-sm text-slate">Rejected requests</p><p className="mt-2 text-3xl font-extrabold text-navy">{(requests ?? []).filter((request) => request.status === "rejected").length}</p></article></div><section className="mt-8 rounded-3xl bg-white p-6"><h2 className="text-xl font-extrabold text-navy">Bookings by channel</h2><div className="mt-4 grid gap-3 sm:grid-cols-4">{channels.map((channel) => <div key={channel.origin} className="rounded-2xl bg-cloud p-4"><p className="font-bold capitalize text-navy">{channel.origin.replaceAll("_", " ")}</p><p className="text-2xl font-extrabold text-orange">{channel.count}</p></div>)}</div></section><section className="mt-8 overflow-x-auto rounded-3xl bg-white p-6"><h2 className="text-xl font-extrabold text-navy">Orders by zone</h2><table className="mt-5 min-w-full text-left text-sm"><thead><tr className="border-b text-slate"><th className="p-3">Zone</th><th className="p-3">Orders</th><th className="p-3">Average road distance</th><th className="p-3">Average fulfilment</th><th className="p-3">Cross-zone</th><th className="p-3">Estimated profit</th></tr></thead><tbody>{zoneRows.map((zone) => <tr key={zone.id} className="border-b border-navy/5"><td className="p-3 font-bold text-navy">{zone.code} · {zone.name}</td><td className="p-3">{zone.orders}</td><td className="p-3">{(zone.averageDistance / 1000).toFixed(1)} km</td><td className="p-3">{zone.averageFulfilmentHours.toFixed(1)} hours</td><td className="p-3">{zone.crossZone}</td><td className="p-3">{formatMoney(zone.estimatedProfit)}</td></tr>)}</tbody></table></section><section className="mt-8 rounded-3xl bg-white p-6"><h2 className="text-xl font-extrabold text-navy">Unavailable service reasons</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{[...reasonCounts.entries()].map(([reason, count]) => <div key={reason} className="rounded-2xl bg-cloud p-4"><p className="font-bold capitalize text-navy">{reason.replaceAll("_", " ")}</p><p className="text-sm text-slate">{count} request{count === 1 ? "" : "s"}</p></div>)}{!reasonCounts.size ? <p className="text-slate">No unavailable-service decisions recorded.</p> : null}</div></section></>;
}
