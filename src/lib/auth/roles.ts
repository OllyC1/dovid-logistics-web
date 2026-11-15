import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "customer" | "rider" | "admin";
export type StaffRole = "super_admin" | "admin" | "rider";
export type StaffStatus = "pending" | "active" | "suspended" | "revoked";

export async function getAuthenticatedRole() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: membership }, { data: assurance }] = await Promise.all([
    supabase.from("profiles").select("role,full_name").eq("id", user.id).single(),
    supabase.from("staff_memberships").select("staff_role,status").eq("user_id", user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if (!profile) return null;
  const staffRole = membership?.staff_role as StaffRole | undefined;
  const staffStatus = membership?.status as StaffStatus | undefined;
  const profileRole = profile.role as AppRole;
  const role = staffRole && staffStatus !== "active" && profileRole !== "customer" ? "customer" : profileRole;
  return {
    user,
    role,
    fullName: profile.full_name as string | null,
    staffRole: staffRole ?? null,
    staffStatus: staffStatus ?? null,
    currentAal: assurance?.currentLevel ?? "aal1",
    nextAal: assurance?.nextLevel ?? "aal1",
    supabase
  };
}

export async function requireRole(roles: AppRole[]) {
  const auth = await getAuthenticatedRole();
  if (!auth) redirect("/login");
  if (!roles.includes(auth.role)) redirect("/account");
  if (auth.role === "admin" && (!auth.staffRole || auth.staffStatus !== "active")) redirect("/account");
  if (auth.role === "admin" && auth.currentAal !== "aal2") redirect("/staff/mfa?next=/admin");
  return auth;
}
