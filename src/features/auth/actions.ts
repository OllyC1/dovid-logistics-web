"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { postLoginDestination, type StaffRole, type StaffStatus } from "@/lib/auth/role-resolution";
import { isStrongNewPassword, NEW_PASSWORD_HINT, NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { getVerifiedAuthenticatorAssuranceLevel } from "@/lib/auth/assurance";

export type AuthState = { error?: string; success?: string };
const credentialsSchema = z.object({ email: z.email(), password: z.string().min(8) });
const newPasswordSchema = z.string().min(NEW_PASSWORD_MIN_LENGTH).max(NEW_PASSWORD_MAX_LENGTH).refine(isStrongNewPassword);

function describeAuthFailure(error: unknown) {
  if (!(error instanceof Error)) return "unknown error";
  if (error.message.includes("not configured")) return error.message;
  if (error instanceof TypeError) return error.message.slice(0,200);
  return error.name;
}

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password of at least 8 characters." };
  let destination = "/account";
  try {
    const supabase = await createSupabaseServerClient();
    const { data: signIn, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !signIn.user) return { error: "The email or password is incorrect." };
    const admin = createSupabaseAdminClient();
    const [{ data: membership }, assurance, { data: invitation }] = await Promise.all([
      supabase.from("staff_memberships").select("staff_role,status").eq("user_id", signIn.user.id).maybeSingle(),
      getVerifiedAuthenticatorAssuranceLevel(supabase, signIn.session?.access_token),
      admin.from("staff_invitations").select("id").eq("auth_user_id", signIn.user.id).in("status", ["pending", "sent", "accepted"]).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle(),
    ]);
    const staffRole = (membership?.staff_role as StaffRole | undefined) ?? null;
    const staffStatus = (membership?.status as StaffStatus | undefined) ?? null;
    destination = staffStatus !== "active" && invitation ? "/staff/setup" : postLoginDestination(
      staffRole,
      staffStatus,
      assurance?.currentLevel === "aal2" ? "aal2" : "aal1",
    );
  } catch (error) {
    console.error(`[auth.login] ${describeAuthFailure(error)}`);
    return { error: "We couldn’t log you in right now. Please try again." };
  }
  redirect(destination);
}

export async function registerAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.extend({ password: newPasswordSchema, fullName: z.string().min(2), phone: z.string().min(7).max(20) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Check your name, phone and email. ${NEW_PASSWORD_HINT}` };
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
  let signedOut = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    signedOut = !error;
  } catch {}
  redirect(signedOut ? "/?signedOut=1" : "/?signOutError=1");
}
