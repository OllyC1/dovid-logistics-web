import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const staffProfileSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  preferredName: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
});

export async function POST(request: Request) {
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
  if (!invitation.is_bootstrap) {
    const parsed = staffProfileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || (invitation.intended_role === "rider" && !parsed.data.phone)) return NextResponse.json({ error: invitation.intended_role === "rider" ? "Add the rider's name and reachable mobile number before continuing." : "Add your first and last name before continuing." }, { status: 400 });
    const preferred = parsed.data.preferredName ? ` (${parsed.data.preferredName})` : "";
    const profile = await admin.from("profiles").update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName, preferred_name: parsed.data.preferredName ?? null, full_name: `${parsed.data.firstName} ${parsed.data.lastName}${preferred}`, phone: parsed.data.phone ?? null, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (profile.error) return NextResponse.json({ error: "Your staff contact details could not be saved. Please try again." }, { status: 409 });
  }
  const rpc = invitation.is_bootstrap
    ? await admin.rpc("finalize_initial_super_admin", { target_user_id: user.id })
    : await admin.rpc("accept_staff_invitation", { target_user_id: user.id });
  if (rpc.error) return NextResponse.json({ error: rpc.error.message }, { status: 409 });
  return NextResponse.json({ result: rpc.data, next: invitation.is_bootstrap ? "/admin/team" : "/staff/setup" });
}
