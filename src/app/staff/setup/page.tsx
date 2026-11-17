import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/account/account-forms";
import { MfaPanel, StaffInvitationAcceptance } from "@/components/staff/mfa-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CheckCircle2, Clock3 } from "lucide-react";

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
  const [{ data: membership }, { data: assurance }] = await Promise.all([
    admin.from("staff_memberships").select("staff_role,status").eq("user_id", user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (membership?.status === "active") {
    if (membership.staff_role === "rider") redirect("/rider");
    if (membership.staff_role === "super_admin" && assurance?.currentLevel !== "aal2") redirect("/staff/mfa?next=/admin");
    redirect("/admin");
  }
  if (!invitation || new Date(invitation.expires_at) <= new Date()) redirect("/account");
  const mfaRequired = invitation.is_bootstrap;
  const accepted = invitation.status === "accepted";
  return <main className="container max-w-3xl py-14">
    <p className="eyebrow">Private staff onboarding</p>
    <h1 className="mt-3 text-3xl font-extrabold text-navy">Secure your Dovid account</h1>
    <p className="mt-4 leading-7 text-slate">This invitation only proves control of the invited email. Staff access stays inactive until you choose a password and complete the required security and identity checks.</p>
    {accepted && !mfaRequired ? <section className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-700" aria-hidden="true" /><div><h2 className="text-xl font-extrabold text-emerald-950">Invitation confirmed</h2><p className="mt-2 text-sm leading-6 text-emerald-900">Your password and staff invitation are complete. Your account is waiting for the Super Admin to verify your identity and approve access.</p></div></div><div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-sm text-slate"><Clock3 className="size-5 shrink-0 text-orange" aria-hidden="true" /><span><strong className="text-navy">Final step:</strong> Super Admin approval. You do not need multifactor authentication.</span></div></section> : <>
      <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-navy">1. Choose your private password</h2>
        <p className="mt-2 text-sm leading-6 text-slate">Your password is sent directly to Supabase Auth. Dovid staff cannot see it.</p>
        <div className="mt-5"><PasswordForm /></div>
      </section>
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-navy">2. {mfaRequired ? "Protect privileged access" : "Confirm your staff invitation"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate">{mfaRequired ? "Use an authenticator app. Super Admin pages require a freshly verified two-step session." : "Confirm the invitation after setting your password. Only the Super Admin needs multifactor authentication."}</p>
        <div className="mt-5">{mfaRequired ? <MfaPanel mode="enroll" /> : <StaffInvitationAcceptance intendedRole={invitation.intended_role as "admin" | "rider"} />}</div>
      </section>
      {!mfaRequired ? <section className="mt-6 rounded-3xl border border-navy/10 bg-cloud p-6"><h2 className="text-xl font-extrabold text-navy">3. Super Admin approval</h2><p className="mt-2 text-sm leading-6 text-slate">After you confirm the invitation, the Super Admin will verify your identity and activate the correct admin or rider workspace.</p></section> : null}
    </>}
  </main>;
}
