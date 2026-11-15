import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { findAuthUserByEmail } from "@/lib/auth/admin-users";
import { canInviteRole, getStaffAuthorization } from "@/lib/auth/staff";
import { publicEnv } from "@/lib/env";

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
  let deliveryError: Error | null = null;
  if (!authUser) {
    const invited = await auth.admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo, data: { onboarding: "staff_invitation" } });
    authUser = invited.data.user;
    deliveryError = invited.error;
  } else if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) {
    return NextResponse.json({ error: "This identity is suspended and cannot be invited." }, { status: 409 });
  } else {
    const mailClient = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    if (authUser.email_confirmed_at) {
      const recovery = await mailClient.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
      deliveryError = recovery.error;
    } else {
      const resent = await mailClient.auth.resend({ type: "signup", email: parsed.data.email, options: { emailRedirectTo: redirectTo } });
      deliveryError = resent.error;
    }
  }
  if (deliveryError || !authUser) return NextResponse.json({ error: "The secure invitation email could not be delivered." }, { status: 502 });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: invitationId, error } = await auth.admin.rpc("register_staff_invitation", {
    target_email: parsed.data.email,
    intended_role: parsed.data.role,
    target_auth_user_id: authUser.id,
    actor_id: auth.user.id,
    requested_permissions: parsed.data.permissions,
    invitation_expires_at: expiresAt
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ invitationId, status: "sent", expiresAt }, { status: 201 });
}
