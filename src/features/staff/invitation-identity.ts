import type { SupabaseClient } from "@supabase/supabase-js";

export type InvitationIdentityCleanup = "not_new" | "referenced" | "removed" | "failed";

export async function removeUnregisteredInvitationIdentity(
  admin: SupabaseClient,
  identity: { userId: string; createdForInvitation: boolean },
): Promise<InvitationIdentityCleanup> {
  if (!identity.createdForInvitation) return "not_new";

  const [membership, invitation] = await Promise.all([
    admin.from("staff_memberships").select("user_id", { count: "exact", head: true }).eq("user_id", identity.userId),
    admin.from("staff_invitations").select("id", { count: "exact", head: true }).eq("auth_user_id", identity.userId),
  ]);
  if (membership.error || invitation.error) return "failed";
  if ((membership.count ?? 0) > 0 || (invitation.count ?? 0) > 0) return "referenced";

  const removed = await admin.auth.admin.deleteUser(identity.userId);
  return removed.error ? "failed" : "removed";
}
