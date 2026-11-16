import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const [{ data: { user } }, { data: assurance }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if (!user?.email || !user.email_confirmed_at) return NextResponse.json({ error: "Open the verified invitation link before continuing." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin.from("staff_invitations")
    .select("id,intended_role,is_bootstrap,status,expires_at")
    .eq("auth_user_id", user.id)
    .in("status", ["pending", "sent", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!invitation || new Date(invitation.expires_at) <= new Date()) return NextResponse.json({ error: "This staff invitation is unavailable or has expired." }, { status: 410 });
  if (invitation.is_bootstrap && assurance?.currentLevel !== "aal2") {
    return NextResponse.json({ error: "Verify your authenticator code before privileged access can be granted." }, { status: 403 });
  }
  const rpc = invitation.is_bootstrap
    ? await admin.rpc("finalize_initial_super_admin", { target_user_id: user.id })
    : await admin.rpc("accept_staff_invitation", { target_user_id: user.id });
  if (rpc.error) return NextResponse.json({ error: rpc.error.message }, { status: 409 });
  return NextResponse.json({ result: rpc.data, next: invitation.is_bootstrap ? "/admin/team" : "/account" });
}
