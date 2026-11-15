import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "customer" | "rider" | "admin";

export async function getAuthenticatedRole() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
  return profile ? { user, role: profile.role as AppRole, fullName: profile.full_name as string | null, supabase } : null;
}

export async function requireRole(roles: AppRole[]) {
  const auth = await getAuthenticatedRole();
  if (!auth) redirect("/login");
  if (!roles.includes(auth.role)) redirect("/account");
  return auth;
}
