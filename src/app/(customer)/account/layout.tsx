import { redirect } from "next/navigation";
import { WorkspaceNavigation, type WorkspaceLink } from "@/components/layout/workspace-navigation";
import { logoutAction } from "@/features/auth/actions";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { activeStaffHome } from "@/lib/auth/role-resolution";
import { LogoutButton } from "@/components/account/logout-button";

export const dynamic="force-dynamic";

export default async function AccountLayout({children}:{children:React.ReactNode}){
  const auth=await getAuthenticatedRole();
  if(!auth)redirect("/login");
  if(auth.staffRole&&auth.staffStatus==="pending")redirect("/staff/setup");
  const staffHome=activeStaffHome(auth.staffRole,auth.staffStatus);
  if(staffHome&&auth.staffRole==="super_admin"&&auth.currentAal!=="aal2")redirect(`/staff/mfa?next=${staffHome}`);
  if(staffHome)redirect(staffHome);
  const links:WorkspaceLink[]=[["Overview","/account"],["Orders","/account/orders"],["Saved addresses","/account/addresses"],["Notifications","/account/notifications"],["Settings","/account/settings"]];
  const logout=<form action={logoutAction}><LogoutButton /></form>;
  return <section className="container py-6 sm:py-10 lg:py-12"><div className="grid min-w-0 gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8"><WorkspaceNavigation label="My Dovid" links={links} footer={logout}/><main className="min-w-0" data-workspace-content>{children}</main></div></section>
}
