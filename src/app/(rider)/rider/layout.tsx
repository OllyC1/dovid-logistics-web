import type { Metadata } from "next";
import { WorkspaceNavigation } from "@/components/layout/workspace-navigation";
import { logoutAction } from "@/features/auth/actions";
import { requireRole } from "@/lib/auth/roles";
export const metadata:Metadata={title:"Rider workspace",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function RiderLayout({children}:{children:React.ReactNode}){
  await requireRole(["rider","admin"]);
  const links=[["Assignments","/rider"],["Performance","/rider/performance"]] as const;
  const logout=<form action={logoutAction}><button className="min-h-11 rounded-xl px-3 py-2 text-sm font-bold text-orange">Log out</button></form>;
  return <section className="container py-6 sm:py-10 lg:py-12"><div className="grid min-w-0 gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8"><WorkspaceNavigation label="Rider workspace" links={links} footer={logout}/><main className="min-w-0" data-workspace-content>{children}</main></div></section>
}
