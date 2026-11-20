import { redirect } from "next/navigation";
import { RecoveryPasswordForm } from "@/components/account/account-forms";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) {
    const admin = createSupabaseAdminClient();
    const [{ data: membership }, { data: invitation }] = await Promise.all([
      admin.from("staff_memberships").select("status").eq("user_id", user.id).maybeSingle(),
      admin.from("staff_invitations").select("id").eq("auth_user_id", user.id).in("status", ["pending", "sent", "accepted"]).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle(),
    ]);
    if (membership?.status !== "active" && invitation) redirect("/staff/setup");
  }

  return <>
    <p className="eyebrow">Choose a password</p>
    <h1 className="mt-3 text-3xl font-extrabold text-navy">Complete password recovery</h1>
    <p className="mt-4 leading-7 text-slate">You opened a verified email recovery link. Choose a new password; your current password is not required here.</p>
    <div className="mt-7"><RecoveryPasswordForm /></div>
  </>;
}
