import { redirect } from "next/navigation";
import { WorkspaceNavigation, type WorkspaceLink } from "@/components/layout/workspace-navigation";
import { logoutAction } from "@/features/auth/actions";
import { getAuthenticatedRole } from "@/lib/auth/roles";

export const dynamic="force-dynamic";

export default async function AccountLayout({children}:{children:React.ReactNode}){
  const auth=await getAuthenticatedRole();
  if(!auth)redirect("/login");
  const links:WorkspaceLink[]=[["Overview","/account"],["Orders","/account/orders"],["Saved addresses","/account/addresses"],["Notifications","/account/notifications"],["Settings","/account/settings"]];
  if(auth.role==="admin")links.push(["Finance & pricing","/admin"]);
  if(auth.role==="rider")links.push(["Rider workspace","/rider"]);
  const logout=<form action={logoutAction}><button className="min-h-11 rounded-xl px-3 py-2 text-sm font-bold text-orange">Log out</button></form>;
  return <section className="container py-6 sm:py-10 lg:py-12"><div className="grid min-w-0 gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8"><WorkspaceNavigation label="My Dovid" links={links} footer={logout}/><main className="min-w-0" data-workspace-content>{children}</main></div></section>
}
