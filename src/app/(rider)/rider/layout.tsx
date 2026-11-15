import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/roles";
export const metadata:Metadata={title:"Rider workspace",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function RiderLayout({children}:{children:React.ReactNode}){await requireRole(["rider","admin"]);return <section className="container py-12"><div className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Rider workspace</p><h1 className="mt-2 text-3xl font-extrabold text-navy">Deliver safely. Finish clearly.</h1></div><nav className="flex gap-2"><Link className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white" href="/rider">Assignments</Link><Link className="rounded-full border border-navy/10 px-4 py-2 text-sm font-bold text-navy" href="/rider/performance">Performance</Link></nav></div>{children}</section>}
