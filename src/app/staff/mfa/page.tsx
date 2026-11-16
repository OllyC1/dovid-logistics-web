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
  const roleHome = auth.staffRole === "rider" ? "/rider" : "/admin";
  if (auth.staffRole !== "super_admin") redirect(roleHome);
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : roleHome;
  if (auth.currentAal === "aal2") redirect(next);
  const needsEnrollment = auth.nextAal !== "aal2";
  return <main className="container max-w-xl py-14"><p className="eyebrow">Privileged access</p><h1 className="mt-3 text-3xl font-extrabold text-navy">{needsEnrollment ? "Protect your staff account" : "Verify it’s really you"}</h1><p className="mt-4 leading-7 text-slate">{needsEnrollment ? "Set up an authenticator before opening staff tools." : "Enter a current code from your authenticator app before opening staff tools."}</p><section className="mt-8 rounded-3xl bg-white p-6 shadow-sm"><MfaPanel mode={needsEnrollment ? "enroll" : "challenge"} next={next} completeOnboarding={false} /></section></main>;
}
