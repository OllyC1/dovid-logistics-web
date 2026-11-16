import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/roles";
export const metadata:Metadata={title:"Rider workspace",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function RiderLayout({children}:{children:React.ReactNode}){await requireRole(["rider","admin"]);return <section className="container py-6 sm:py-10 lg:py-12" data-workspace-content><div className="mb-6 grid min-w-0 gap-5 sm:mb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"><div className="min-w-0"><p className="eyebrow">Rider workspace</p><h1 className="mt-2 text-2xl font-extrabold text-navy sm:text-3xl">Deliver safely. Finish clearly.</h1></div><nav className="grid grid-cols-2 gap-2 sm:flex" aria-label="Rider workspace navigation"><Link className="rounded-full bg-navy px-4 py-3 text-center text-sm font-bold text-white" href="/rider">Assignments</Link><Link className="rounded-full border border-navy/10 px-4 py-3 text-center text-sm font-bold text-navy" href="/rider/performance">Performance</Link></nav></div><main className="min-w-0">{children}</main></section>}
