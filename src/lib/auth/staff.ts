import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedRole, type StaffRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";

export type StaffPermission =
  | "staff.view"
  | "riders.invite"
  | "riders.manage"
  | "dispatch.manage"
  | "bookings.manage"
  | "pricing.view"
  | "pricing.manage"
  | "payments.view"
  | "payments.reconcile"
  | "reports.view"
  | "zones.manage"
  | "admins.invite"
  | "admins.manage_permissions"
  | "staff.suspend";

export async function getStaffAuthorization(requiredPermission?: StaffPermission) {
  const auth = await getAuthenticatedRole();
  if (!auth || !auth.staffRole || auth.staffStatus !== "active") return null;
  if (auth.staffRole === "super_admin" && auth.currentAal !== "aal2") return null;
  const admin = createSupabaseAdminClient();
  const { data: membership } = await admin.from("staff_memberships")
    .select("staff_role,status")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership || membership.status !== "active") return null;
  const staffRole = membership.staff_role as StaffRole;
  if (staffRole === "super_admin") return { ...auth, staffRole, permissions: ["*"] as const, admin };
  const { data: grants } = await admin.from("staff_permission_grants")
    .select("permission_key")
    .eq("user_id", auth.user.id);
  const permissions = (grants ?? []).map((grant) => grant.permission_key as StaffPermission);
  if (requiredPermission && !permissions.includes(requiredPermission)) return null;
  return { ...auth, staffRole, permissions, admin };
}

export function canInviteRole(staffRole: StaffRole, permissions: readonly string[], intendedRole: "admin" | "rider") {
  if (intendedRole === "admin") return staffRole === "super_admin";
  return staffRole === "super_admin" || permissions.includes("riders.invite");
}

export async function requireStaffPermission(permission: StaffPermission) {
  const authorization = await getStaffAuthorization(permission);
  if (authorization) return authorization;
  const session = await getAuthenticatedRole();
  if (!session) redirect("/login");
  if (session.staffRole === "super_admin" && session.currentAal !== "aal2") redirect("/staff/mfa?next=/admin");
  redirect("/account");
}

export async function requirePricingManager(roles?: unknown) { void roles; return requireStaffPermission("pricing.manage"); }
export async function requirePricingViewer(roles?: unknown) { void roles; return requireStaffPermission("pricing.view"); }
export async function requireReportsViewer(roles?: unknown) { void roles; return requireStaffPermission("reports.view"); }
export async function getBookingsManagerAuthorization() { return getStaffAuthorization("bookings.manage"); }
export async function getDispatchManagerAuthorization() { return getStaffAuthorization("dispatch.manage"); }
export async function getPaymentsReconcilerAuthorization() { return getStaffAuthorization("payments.reconcile"); }
export async function getPricingManagerAuthorization() { return getStaffAuthorization("pricing.manage"); }
export async function getZonesManagerAuthorization() { return getStaffAuthorization("zones.manage"); }
