import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { findAuthUserByEmail } from "@/lib/auth/admin-users";
import { canInviteRole, getStaffAuthorization } from "@/lib/auth/staff";
import { publicEnv } from "@/lib/env";
import { removeUnregisteredInvitationIdentity } from "@/features/staff/invitation-identity";
import { queueExistingUserStaffInvitation } from "@/lib/notifications/staff-invitation-email";

const permissionKeys = ["staff.view","riders.invite","riders.manage","dispatch.manage","bookings.manage","pricing.view","pricing.manage","payments.view","payments.reconcile","reports.view","zones.manage","staff.suspend"] as const;
const schema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  role: z.enum(["admin", "rider"]),
  permissions: z.array(z.enum(permissionKeys)).max(permissionKeys.length).default([])
});

export async function POST(request: NextRequest) {
  const auth = await getStaffAuthorization();
  if (!auth) return NextResponse.json({ error: "Verified staff authorization is required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid staff email, role and permission set." }, { status: 400 });
  if (!canInviteRole(auth.staffRole, auth.permissions, parsed.data.role)) return NextResponse.json({ error: "You are not allowed to invite this staff role." }, { status: 403 });
  if (parsed.data.role === "rider" && parsed.data.permissions.length) return NextResponse.json({ error: "Riders do not receive administrative permissions." }, { status: 400 });

  const redirectTo = `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/staff/setup`;
  let authUser = await findAuthUserByEmail(auth.admin, parsed.data.email);
  let createdForInvitation = false;
  let deliveryError: Error | null = null;
  let applicationEmailRequired = false;
  if (!authUser) {
    const invited = await auth.admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo, data: { onboarding: "staff_invitation", staff_role: parsed.data.role } });
    authUser = invited.data.user;
    createdForInvitation = Boolean(invited.data.user);
    deliveryError = invited.error;
  } else if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) {
    return NextResponse.json({ error: "This identity is suspended and cannot be invited." }, { status: 409 });
  } else {
    const [membershipLookup, invitationLookup] = await Promise.all([
      auth.admin.from("staff_memberships").select("user_id", { count: "exact", head: true }).eq("user_id", authUser.id).in("status", ["pending", "active", "suspended"]),
      auth.admin.from("staff_invitations").select("id", { count: "exact", head: true }).eq("email", parsed.data.email).in("status", ["pending", "sent", "accepted"]),
    ]);
    if (membershipLookup.error || invitationLookup.error) return NextResponse.json({ error: "Staff identity checks are temporarily unavailable. No invitation email was sent." }, { status: 503 });
    if ((membershipLookup.count ?? 0) > 0) return NextResponse.json({ error: "This identity already has a staff membership. Manage it from the team list instead." }, { status: 409 });
    if ((invitationLookup.count ?? 0) > 0) return NextResponse.json({ error: "An active invitation already exists for this email. Resend or manage that invitation instead." }, { status: 409 });
    const mailClient = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    if (authUser.email_confirmed_at) {
      applicationEmailRequired = true;
    } else {
      const resent = await mailClient.auth.resend({ type: "signup", email: parsed.data.email, options: { emailRedirectTo: redirectTo } });
      deliveryError = resent.error;
    }
  }
  if (deliveryError || !authUser) {
    if (authUser) {
      const cleanup = await removeUnregisteredInvitationIdentity(auth.admin, { userId: authUser.id, createdForInvitation });
      if (cleanup === "failed" || cleanup === "referenced") return NextResponse.json({ error: "The invitation was not completed and its identity requires an administrator to review it before retrying. No staff role was granted." }, { status: 500 });
    }
    const rateLimited = deliveryError?.message.toLowerCase().includes("rate limit") || "status" in (deliveryError ?? {}) && (deliveryError as { status?: number }).status === 429;
    return NextResponse.json({ error: rateLimited ? "Supabase has temporarily limited invitation emails. No staff invitation was created. Please wait before trying again, or configure a dedicated SMTP provider for reliable team emails." : "The secure invitation email could not be delivered. No staff invitation was created." }, { status: rateLimited ? 429 : 502 });
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: invitationId, error } = await auth.admin.rpc("register_staff_invitation", {
    target_email: parsed.data.email,
    intended_role: parsed.data.role,
    target_auth_user_id: authUser.id,
    actor_id: auth.user.id,
    requested_permissions: parsed.data.permissions,
    invitation_expires_at: expiresAt
  });
  if (error) {
    const cleanup = await removeUnregisteredInvitationIdentity(auth.admin, { userId: authUser.id, createdForInvitation });
    if (cleanup === "failed" || cleanup === "referenced") return NextResponse.json({ error: "The staff invitation was not registered and its new identity requires administrator review. No staff role was granted." }, { status: 500 });
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (applicationEmailRequired) {
    const { error: queueError } = await queueExistingUserStaffInvitation(auth.admin, {
      invitationId,
      email: parsed.data.email,
      role: parsed.data.role,
      expiresAt,
      deduplicationKey: `email:staff-invitation:${invitationId}:initial`
    });
    if (queueError) {
      await auth.admin.from("staff_invitations").update({ status: "pending", sent_at: null, updated_at: new Date().toISOString() }).eq("id", invitationId);
      await auth.admin.from("staff_audit_events").insert({ actor_id: auth.user.id, action: "staff.invitation.email_queue_failed", target_user_id: authUser.id, invitation_id: invitationId });
      return NextResponse.json({ error: "The staff invitation was saved, but its purpose-specific email could not be queued. Use Resend from the pending invitation." }, { status: 502 });
    }
  }
  return NextResponse.json({ invitationId, status: applicationEmailRequired ? "queued" : "sent", expiresAt }, { status: 201 });
}
