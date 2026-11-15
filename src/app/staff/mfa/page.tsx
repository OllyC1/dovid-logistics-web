import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaPanel } from "@/components/staff/mfa-panel";
import { getAuthenticatedRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Verify secure access", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StaffMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth) redirect("/login");
  if (!auth.staffRole) redirect("/account");
  const requested = (await searchParams).next;
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/admin";
  if (auth.currentAal === "aal2") redirect(next);
  return <main className="container max-w-xl py-14"><p className="eyebrow">Privileged access</p><h1 className="mt-3 text-3xl font-extrabold text-navy">Verify it’s really you</h1><p className="mt-4 leading-7 text-slate">Enter a current code from your authenticator app before opening staff tools.</p><section className="mt-8 rounded-3xl bg-white p-6 shadow-sm"><MfaPanel mode="challenge" next={next} /></section></main>;
}
