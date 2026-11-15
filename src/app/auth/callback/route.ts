import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) { try { const supabase = await createSupabaseServerClient(); await supabase.auth.exchangeCodeForSession(code); } catch {} }
  return NextResponse.redirect(new URL("/account", request.url));
}
