import type { SupabaseClient } from "@supabase/supabase-js";

export async function queueExistingUserStaffInvitation(admin: SupabaseClient, input: {
  invitationId: string;
  email: string;
  role: "admin" | "rider";
  expiresAt: string;
  deduplicationKey: string;
}) {
  const roleName = input.role === "rider" ? "rider" : "administrator";
  return admin.from("notifications").insert({
    customer_id: null,
    order_id: null,
    channel: "email",
    event_type: "staff_invitation_existing_user",
    title: `Dovid Logistics ${roleName} invitation`,
    subject: `You've been invited as a Dovid Logistics ${roleName}`,
    body: `A Super Admin has invited the existing account for this email to join Dovid Logistics as ${roleName === "rider" ? "a rider" : "an administrator"}. Sign in with your existing password to review the invitation and complete your details. Your staff access stays inactive until identity checks and final approval are complete.`,
    recipient_email: input.email.toLowerCase(),
    deduplication_key: input.deduplicationKey,
    status: "queued",
    delivery_status: "queued",
    priority: 90,
    metadata: {
      actionPath: "/login",
      invitationId: input.invitationId,
      staffRole: input.role,
      expiresAt: input.expiresAt
    },
    next_attempt_at: new Date().toISOString()
  });
}
