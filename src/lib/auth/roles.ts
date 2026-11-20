import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  activeStaffHome,
  resolveTrustedAppRole,
  roleHome,
  type AppRole,
  type StaffRole,
  type StaffStatus,
} from "@/lib/auth/role-resolution";
import { getVerifiedAuthenticatorAssuranceLevel } from "@/lib/auth/assurance";

export type { AppRole, StaffRole, StaffStatus } from "@/lib/auth/role-resolution";

export async function getAuthenticatedRole() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: membership }, assurance] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase.from("staff_memberships").select("staff_role,status").eq("user_id", user.id).maybeSingle(),
    getVerifiedAuthenticatorAssuranceLevel(supabase),
  ]);
  if (!profile) return null;
  const staffRole = membership?.staff_role as StaffRole | undefined;
  const staffStatus = membership?.status as StaffStatus | undefined;
  const currentAal = assurance?.currentLevel === "aal2" ? "aal2" : "aal1";
  const role = resolveTrustedAppRole(staffRole ?? null, staffStatus ?? null, currentAal);
  return {
    user,
    role,
    fullName: profile.full_name as string | null,
    staffRole: staffRole ?? null,
    staffStatus: staffStatus ?? null,
    currentAal,
    nextAal: assurance?.nextLevel ?? "aal1",
    supabase
  };
}

export async function requireRole(roles: AppRole[]) {
  const auth = await getAuthenticatedRole();
  if (!auth) redirect("/login");
  const staffHome = activeStaffHome(auth.staffRole, auth.staffStatus);
  if (auth.staffRole && auth.staffStatus === "pending") redirect("/staff/setup");
  if (staffHome && auth.staffRole === "super_admin" && auth.currentAal !== "aal2") redirect(`/staff/mfa?next=${staffHome}`);
  if (!roles.includes(auth.role)) redirect(roleHome(auth.role));
  return auth;
}
