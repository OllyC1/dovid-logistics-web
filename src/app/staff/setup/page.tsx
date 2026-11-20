import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StaffOnboardingWizard } from "@/components/staff/mfa-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CheckCircle2, Clock3 } from "lucide-react";
import { getVerifiedAuthenticatorAssuranceLevel } from "@/lib/auth/assurance";

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
  const [{ data: membership }, assurance] = await Promise.all([
    admin.from("staff_memberships").select("staff_role,status").eq("user_id", user.id).maybeSingle(),
    getVerifiedAuthenticatorAssuranceLevel(supabase),
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
    {accepted && !mfaRequired ? <section className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm"><ol className="mb-5 flex items-center gap-2" aria-label="Staff onboarding progress"><li className="flex-1 rounded-full bg-emerald-100 px-3 py-2 text-center text-sm font-bold text-emerald-900">1. Password</li><li className="flex-1 rounded-full bg-emerald-100 px-3 py-2 text-center text-sm font-bold text-emerald-900">2. Your details</li><li className="flex-1 rounded-full bg-orange px-3 py-2 text-center text-sm font-bold text-white">3. Approval</li></ol><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-700" aria-hidden="true" /><div><h2 className="text-xl font-extrabold text-emerald-950">Invitation confirmed</h2><p className="mt-2 text-sm leading-6 text-emerald-900">Your password and staff invitation are complete. Your account is waiting for the Super Admin to verify your identity and approve access.</p></div></div><div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-sm text-slate"><Clock3 className="size-5 shrink-0 text-orange" aria-hidden="true" /><span><strong className="text-navy">Final step:</strong> Super Admin approval. You do not need multifactor authentication.</span></div></section> : <StaffOnboardingWizard intendedRole={mfaRequired ? "admin" : invitation.intended_role as "admin" | "rider"} mfaRequired={mfaRequired} />}
  </main>;
}
