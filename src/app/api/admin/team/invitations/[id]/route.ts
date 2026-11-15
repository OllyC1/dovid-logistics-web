import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canInviteRole, getStaffAuthorization } from "@/lib/auth/staff";
import { publicEnv } from "@/lib/env";

async function loadInvitation(id: string) {
  const auth = await getStaffAuthorization();
  if (!auth) return { response: NextResponse.json({ error: "Verified staff authorization is required." }, { status: 403 }) };
  const { data: invitation } = await auth.admin.from("staff_invitations").select("id,email,intended_role,status,auth_user_id,is_bootstrap").eq("id", id).maybeSingle();
  if (!invitation || invitation.is_bootstrap) return { response: NextResponse.json({ error: "Staff invitation not found." }, { status: 404 }) };
  if (!canInviteRole(auth.staffRole, auth.permissions, invitation.intended_role as "admin" | "rider")) return { response: NextResponse.json({ error: "You are not allowed to manage this invitation." }, { status: 403 }) };
  return { auth, invitation };
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadInvitation((await params).id);
  if ("response" in loaded) return loaded.response;
  const { auth, invitation } = loaded;
  if (invitation.status === "revoked") return NextResponse.json({ error: "Revoked invitations cannot be resent." }, { status: 409 });
  const { data: authUser } = await auth.admin.auth.admin.getUserById(invitation.auth_user_id);
  if (!authUser.user) return NextResponse.json({ error: "The invited identity no longer exists." }, { status: 409 });
  const redirectTo = `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/staff/setup`;
  const mailClient = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const delivered = authUser.user.email_confirmed_at
    ? await mailClient.auth.resetPasswordForEmail(invitation.email, { redirectTo })
    : await mailClient.auth.resend({ type: "signup", email: invitation.email, options: { emailRedirectTo: redirectTo } });
  if (delivered.error) return NextResponse.json({ error: "The secure invitation email could not be resent." }, { status: 502 });
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await auth.admin.from("staff_invitations").update({ status: "sent", sent_at: new Date().toISOString(), expires_at: expiresAt, updated_at: new Date().toISOString() }).eq("id", invitation.id);
  await auth.admin.from("staff_audit_events").insert({ actor_id: auth.user.id, action: "staff.invitation.resent", target_user_id: invitation.auth_user_id, invitation_id: invitation.id, metadata: { expiresAt } });
  return NextResponse.json({ status: "sent", expiresAt });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadInvitation((await params).id);
  if ("response" in loaded) return loaded.response;
  const { auth, invitation } = loaded;
  if (invitation.status === "accepted") return NextResponse.json({ error: "Manage the accepted staff membership instead." }, { status: 409 });
  if (invitation.status !== "revoked") {
    const now = new Date().toISOString();
    await auth.admin.from("staff_invitations").update({ status: "revoked", revoked_at: now, updated_at: now }).eq("id", invitation.id);
    await auth.admin.from("staff_audit_events").insert({ actor_id: auth.user.id, action: "staff.invitation.revoked", target_user_id: invitation.auth_user_id, invitation_id: invitation.id });
  }
  return NextResponse.json({ status: "revoked" });
}
