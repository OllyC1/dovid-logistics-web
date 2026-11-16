import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceNavigation } from "@/components/layout/workspace-navigation";
import { logoutAction } from "@/features/auth/actions";
import { getStaffAuthorization, type StaffPermission } from "@/lib/auth/staff";
import { requireRole } from "@/lib/auth/roles";
export const metadata:Metadata={title:"Dovid administration",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
const links=[
  ["Overview","/admin",null],
  ["Team & access","/admin/team","staff.view"],
  ["Email delivery","/admin/email","staff.view"],
  ["Assisted bookings","/admin/whatsapp-bookings","bookings.manage"],
  ["Coverage","/admin/coverage","zones.manage"],
  ["Dispatch","/admin/dispatch","dispatch.manage"],
  ["Delivery runs","/admin/run-operations","dispatch.manage"],
  ["Operations reports","/admin/operations","reports.view"],
  ["Rate cards","/admin/rate-cards","pricing.manage"],
  ["Cost configuration","/admin/cost-configuration","pricing.manage"],
  ["Competitor pricing","/admin/competitors","pricing.manage"],
  ["Profitability","/admin/profitability","pricing.view"],
  ["Promotions","/admin/promotions","pricing.manage"],
  ["Pricing history","/admin/history","pricing.manage"],
] as const;
export default async function AdminLayout({children}:{children:React.ReactNode}){
  await requireRole(["admin"]);
  const auth=await getStaffAuthorization();
  if(!auth) notFound();
  const visibleLinks=links.filter(([, , permission])=>auth.staffRole==="super_admin"||permission===null||auth.permissions.includes(permission as StaffPermission)).map(([label,href])=>[label,href] as const);
  const logout=<form action={logoutAction}><button className="min-h-11 rounded-xl px-3 py-2 text-sm font-bold text-orange">Log out</button></form>;
  return <section className="container py-6 sm:py-10 lg:py-12"><div className="grid min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8"><WorkspaceNavigation label={auth.staffRole==="super_admin"?"Super Admin":"Dovid admin"} links={visibleLinks} footer={logout}/><main className="min-w-0" data-workspace-content>{children}</main></div></section>
}
