import { NextResponse, type NextRequest } from "next/server";
import { postLoginDestination, type StaffRole, type StaffStatus } from "@/lib/auth/role-resolution";
import { getVerifiedAuthenticatorAssuranceLevel } from "@/lib/auth/assurance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";

function finalUrl(path: string, request: NextRequest) {
  return new URL(path, publicEnv.NEXT_PUBLIC_APP_URL || request.url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/account";
  if (!code) {
    const completionUrl = finalUrl("/auth/complete", request);
    completionUrl.searchParams.set("next", next);
    return NextResponse.redirect(completionUrl);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authenticated user unavailable after callback");
    const admin = createSupabaseAdminClient();
    const [{ data: membership }, { data: invitation }, assurance] = await Promise.all([
      admin.from("staff_memberships").select("staff_role,status").eq("user_id", user.id).maybeSingle(),
      admin.from("staff_invitations").select("id").eq("auth_user_id", user.id).in("status", ["pending", "sent", "accepted"]).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle(),
      getVerifiedAuthenticatorAssuranceLevel(supabase),
    ]);
    const staffRole = (membership?.staff_role as StaffRole | undefined) ?? null;
    const staffStatus = (membership?.status as StaffStatus | undefined) ?? null;
    const destination = staffStatus !== "active" && invitation ? "/staff/setup" : postLoginDestination(
      staffRole,
      staffStatus,
      assurance?.currentLevel === "aal2" ? "aal2" : "aal1",
    );
    return NextResponse.redirect(finalUrl(next === "/staff/setup" || invitation || staffRole ? destination : next, request));
  } catch {
    const completionUrl = finalUrl("/auth/complete", request);
    completionUrl.searchParams.set("next", next);
    completionUrl.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(completionUrl);
  }
}
