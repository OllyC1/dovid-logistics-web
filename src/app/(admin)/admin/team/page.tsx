import { redirect } from "next/navigation";
import { TeamManagement } from "@/components/admin/team-management";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { getStaffAuthorization } from "@/lib/auth/staff";
import { listAuthUsers } from "@/lib/auth/admin-users";

export const dynamic = "force-dynamic";

export default async function TeamManagementPage() {
  const session = await getAuthenticatedRole();
  if (!session) redirect("/login");
  if (session.currentAal !== "aal2") redirect("/staff/mfa?next=/admin/team");
  const auth = await getStaffAuthorization("staff.view");
  if (!auth) redirect("/admin");

  const [{ data: memberships }, { data: invitations }, { data: grants }, { data: permissionRows }, { data: audit }, authUsers] = await Promise.all([
    auth.admin.from("staff_memberships").select("user_id,staff_role,status,identity_verified_at,suspended_at,suspension_reason,created_at,profiles(full_name,phone)").order("created_at"),
    auth.admin.from("staff_invitations").select("id,email,intended_role,status,requested_permissions,auth_user_id,sent_at,accepted_at,expires_at,created_at,is_bootstrap").order("created_at", { ascending: false }).limit(100),
    auth.admin.from("staff_permission_grants").select("user_id,permission_key"),
    auth.admin.from("staff_permissions").select("permission_key,description").order("permission_key"),
    auth.admin.from("staff_audit_events").select("id,actor_id,action,target_user_id,invitation_id,metadata,created_at").order("created_at", { ascending: false }).limit(100),
    listAuthUsers(auth.admin)
  ]);
  const emailById = new Map(authUsers.map((user) => [user.id, user.email ?? "Email unavailable"]));
  const permissionByUser = new Map<string, string[]>();
  for (const grant of grants ?? []) permissionByUser.set(grant.user_id, [...(permissionByUser.get(grant.user_id) ?? []), grant.permission_key]);
  const members = (memberships ?? []).map((membership) => {
    const profile = membership.profiles as unknown as { full_name: string | null; phone: string | null } | null;
    return {
      userId: membership.user_id,
      email: emailById.get(membership.user_id) ?? "Email unavailable",
      fullName: profile?.full_name ?? "Name not provided",
      phone: profile?.phone ?? null,
      role: membership.staff_role as "super_admin" | "admin" | "rider",
      status: membership.status as "pending" | "active" | "suspended" | "revoked",
      identityVerifiedAt: membership.identity_verified_at,
      suspensionReason: membership.suspension_reason,
      permissions: permissionByUser.get(membership.user_id) ?? []
    };
  });
  return <TeamManagement
    currentRole={auth.staffRole}
    currentPermissions={[...auth.permissions]}
    members={members}
    invitations={(invitations ?? []).map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.intended_role,
      status: invitation.status,
      expiresAt: invitation.expires_at,
      bootstrap: invitation.is_bootstrap
    }))}
    permissionCatalog={(permissionRows ?? []).filter((permission) => !["admins.invite", "admins.manage_permissions"].includes(permission.permission_key))}
    audit={(audit ?? []).map((event) => ({
      id: String(event.id),
      action: event.action,
      actor: event.actor_id ? (emailById.get(event.actor_id) ?? "Former staff account") : "System",
      target: event.target_user_id ? (emailById.get(event.target_user_id) ?? "Former staff account") : null,
      createdAt: event.created_at
    }))}
  />;
}
