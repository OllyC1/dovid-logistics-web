import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/account/account-forms";
import { MfaPanel, StaffInvitationAcceptance } from "@/components/staff/mfa-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Secure staff setup", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StaffSetupPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin.from("staff_invitations")
    .select("intended_role,status,expires_at,is_bootstrap")
    .eq("auth_user_id", user.id)
    .in("status", ["pending", "sent", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!invitation || new Date(invitation.expires_at) <= new Date()) redirect("/account");
  const mfaRequired = invitation.is_bootstrap || invitation.intended_role === "admin";
  return <main className="container max-w-3xl py-14">
    <p className="eyebrow">Private staff onboarding</p>
    <h1 className="mt-3 text-3xl font-extrabold text-navy">Secure your Dovid account</h1>
    <p className="mt-4 leading-7 text-slate">This invitation only proves control of the invited email. Staff access stays inactive until you choose a password and complete the required security and identity checks.</p>
    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-extrabold text-navy">1. Choose your private password</h2>
      <p className="mt-2 text-sm leading-6 text-slate">Your password is sent directly to Supabase Auth. Dovid staff cannot see it.</p>
      <div className="mt-5"><PasswordForm /></div>
    </section>
    <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-extrabold text-navy">2. {mfaRequired ? "Protect privileged access" : "Accept the invitation"}</h2>
      <p className="mt-2 text-sm leading-6 text-slate">{mfaRequired ? "Use an authenticator app. Privileged pages require a freshly verified two-step session." : "Your rider account remains inactive until documentation, motorcycle and readiness checks are approved."}</p>
      <div className="mt-5">{mfaRequired ? <MfaPanel mode="enroll" /> : <StaffInvitationAcceptance />}</div>
    </section>
  </main>;
}
