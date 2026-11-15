import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/roles";
export const metadata:Metadata={title:"Finance & Pricing",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
const links=[["Overview","/admin"],["Assisted bookings","/admin/whatsapp-bookings"],["Coverage","/admin/coverage"],["Dispatch","/admin/dispatch"],["Delivery runs","/admin/run-operations"],["Operations reports","/admin/operations"],["Rate cards","/admin/rate-cards"],["Cost configuration","/admin/cost-configuration"],["Competitor pricing","/admin/competitors"],["Profitability","/admin/profitability"],["Promotions","/admin/promotions"],["Pricing history","/admin/history"]] as const;
export default async function AdminLayout({children}:{children:React.ReactNode}){await requireRole(["admin"]);return <section className="container py-12"><div className="grid gap-8 lg:grid-cols-[250px_1fr]"><aside className="rounded-3xl bg-navy p-5 text-white"><p className="px-3 text-xs font-bold uppercase tracking-widest text-orange">Finance & Pricing</p><nav className="mt-5 grid gap-1">{links.map(([label,href])=><Link key={href} href={href} className="rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white">{label}</Link>)}</nav></aside><div>{children}</div></div></section>}
