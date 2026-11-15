import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/account";
  if (!code) {
    const completionUrl = new URL("/auth/complete", request.url);
    completionUrl.searchParams.set("next", next);
    return NextResponse.redirect(completionUrl);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return NextResponse.redirect(new URL(next, request.url));
  } catch {
    const completionUrl = new URL("/auth/complete", request.url);
    completionUrl.searchParams.set("next", next);
    completionUrl.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(completionUrl);
  }
}
