import type { Metadata } from "next";
import { WorkspaceNavigation } from "@/components/layout/workspace-navigation";
import { requireRole } from "@/lib/auth/roles";
export const metadata:Metadata={title:"Dovid administration",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
const links=[["Overview","/admin"],["Team & access","/admin/team"],["Email delivery","/admin/email"],["Assisted bookings","/admin/whatsapp-bookings"],["Coverage","/admin/coverage"],["Dispatch","/admin/dispatch"],["Delivery runs","/admin/run-operations"],["Operations reports","/admin/operations"],["Rate cards","/admin/rate-cards"],["Cost configuration","/admin/cost-configuration"],["Competitor pricing","/admin/competitors"],["Profitability","/admin/profitability"],["Promotions","/admin/promotions"],["Pricing history","/admin/history"]] as const;
export default async function AdminLayout({children}:{children:React.ReactNode}){await requireRole(["admin"]);return <section className="container py-6 sm:py-10 lg:py-12"><div className="grid min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8"><WorkspaceNavigation label="Dovid admin" links={links}/><main className="min-w-0" data-workspace-content>{children}</main></div></section>}
