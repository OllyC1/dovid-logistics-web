import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/features/auth/actions";
import { getAuthenticatedRole } from "@/lib/auth/roles";

export const dynamic="force-dynamic";

export default async function AccountLayout({children}:{children:React.ReactNode}){
  const auth=await getAuthenticatedRole();
  if(!auth)redirect("/login");
  const links=[["Overview","/account"],["Orders","/account/orders"],["Saved addresses","/account/addresses"],["Notifications","/account/notifications"],["Settings","/account/settings"]];
  if(auth.role==="admin")links.push(["Finance & pricing","/admin"]);
  if(auth.role==="rider")links.push(["Rider workspace","/rider"]);
  return <section className="container py-12"><div className="grid gap-8 lg:grid-cols-[230px_1fr]"><aside className="rounded-3xl bg-navy p-5 text-white"><p className="px-3 text-xs font-bold uppercase tracking-widest text-orange">My Dovid</p><nav className="mt-5 grid gap-1">{links.map(([label,href])=><Link key={href} href={href} className="rounded-xl px-3 py-2.5 text-sm font-bold text-white/75 hover:bg-white/10 hover:text-white">{label}</Link>)}</nav><form action={logoutAction} className="mt-8"><button className="rounded-xl px-3 py-2 text-sm font-bold text-orange">Log out</button></form></aside><div>{children}</div></div></section>
}
