"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { postLoginDestination, type StaffRole, type StaffStatus } from "@/lib/auth/role-resolution";

export type AuthState = { error?: string; success?: string };
const credentialsSchema = z.object({ email: z.email(), password: z.string().min(8) });

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password of at least 8 characters." };
  let destination = "/account";
  try {
    const supabase = await createSupabaseServerClient();
    const { data: signIn, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !signIn.user) return { error: "The email or password is incorrect." };
    const [{ data: membership }, { data: assurance }] = await Promise.all([
      supabase.from("staff_memberships").select("staff_role,status").eq("user_id", signIn.user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    destination = postLoginDestination(
      (membership?.staff_role as StaffRole | undefined) ?? null,
      (membership?.status as StaffStatus | undefined) ?? null,
      assurance?.currentLevel === "aal2" ? "aal2" : "aal1",
    );
  } catch { return { error: "Authentication is not configured yet." }; }
  redirect(destination);
}

export async function registerAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.extend({ fullName: z.string().min(2), phone: z.string().min(7).max(20) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check your name, phone, email and password." };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback`, data: { full_name: parsed.data.fullName, phone: parsed.data.phone } } });
    if (error) return { error: "We could not create the account. Please try again." };
    return { success: "Check your email to verify your account." };
  } catch { return { error: "Authentication is not configured yet." }; }
}

export async function recoverAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.email() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email address." };
  try { const supabase = await createSupabaseServerClient(); await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password` }); } catch {}
  return { success: "If an account exists for that email, recovery instructions are on the way." };
}

export async function logoutAction() {
  try { const supabase = await createSupabaseServerClient(); await supabase.auth.signOut(); } catch {}
  redirect("/");
}
