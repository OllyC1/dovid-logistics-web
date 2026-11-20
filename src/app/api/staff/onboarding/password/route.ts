import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isStrongNewPassword, NEW_PASSWORD_HINT, NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  password: z.string().min(NEW_PASSWORD_MIN_LENGTH).max(NEW_PASSWORD_MAX_LENGTH).refine(isStrongNewPassword),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: NEW_PASSWORD_HINT }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email || !user.email_confirmed_at) {
    return NextResponse.json({ error: "Open the verified invitation link before choosing your password." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: invitation, error: invitationError }, { data: membership, error: membershipError }] = await Promise.all([
    admin.from("staff_invitations")
      .select("id,status,expires_at")
      .eq("auth_user_id", user.id)
      .in("status", ["pending", "sent"])
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("staff_memberships").select("status").eq("user_id", user.id).maybeSingle(),
  ]);
  if (invitationError || membershipError) return NextResponse.json({ error: "Your invitation could not be verified. Try the email link again." }, { status: 503 });
  if (!invitation || membership?.status !== "pending") {
    return NextResponse.json({ error: "This invitation is no longer waiting for password setup." }, { status: 409 });
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, { password: parsed.data.password });
  if (error) return NextResponse.json({ error: "Your password could not be saved. Refresh the verified invitation link and try again." }, { status: 400 });
  await supabase.auth.refreshSession();
  return NextResponse.json({ saved: true, next: "/staff/setup" });
}
