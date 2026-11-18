import { Bell, MapPin, Package, Plus, WalletCards } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDeliveryStatus, formatPaymentStatus } from "@/lib/utils";

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: orders }, { count: addressCount }, { count: notificationCount }] = await Promise.all([
    supabase.from("profiles").select("full_name").single(),
    supabase.from("delivery_orders").select("id,order_reference,delivery_status,payment_status,created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("customer_addresses").select("id", { count: "exact", head: true }),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
  ]);
  const cards = [
    [Package, "Active deliveries", orders?.filter(order => !["delivered", "cancelled"].includes(order.delivery_status)).length ?? 0],
    [WalletCards, "Payments to complete", orders?.filter(order => order.payment_status !== "paid").length ?? 0],
    [MapPin, "Saved addresses", addressCount ?? 0],
    [Bell, "New updates", notificationCount ?? 0]
  ] as const;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">My Dovid</p><h1 className="mt-2 text-3xl font-extrabold text-navy">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}.</h1><p className="mt-2 text-sm text-slate">Here is what is happening with your deliveries.</p></div><Button href="/book"><Plus className="mr-2 size-4"/>Book a delivery</Button></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([Icon, label, value]) => <article key={label} className="rounded-3xl bg-white p-6 shadow-sm"><Icon className="text-orange"/><p className="mt-5 text-sm text-slate">{label}</p><p className="mt-1 text-3xl font-extrabold text-navy">{value}</p></article>)}</div>
    <section className="mt-8 rounded-3xl bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-extrabold text-navy">Recent deliveries</h2><Link className="text-sm font-bold text-orange" href="/account/orders">View all</Link></div>{orders?.length ? <div className="mt-5 grid gap-3">{orders.map(order => <Link key={order.id} href={`/account/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy/8 p-4"><div><p className="font-bold text-navy">{order.order_reference}</p><p className="text-xs text-slate">{new Date(order.created_at).toLocaleDateString("en-NG")}</p></div><div className="text-right"><p className="text-sm font-bold text-orange">{formatDeliveryStatus(order.delivery_status)}</p><p className="text-xs text-slate">{formatPaymentStatus(order.payment_status)}</p></div></Link>)}</div> : <p className="mt-5 rounded-2xl bg-cloud p-6 text-sm text-slate">No deliveries yet. When you book one, it will appear here.</p>}</section>
  </>;
}
