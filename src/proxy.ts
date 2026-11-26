import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  await supabase.auth.getClaims();
  return response;
}

// Public marketing, booking, tracking, guest and webhook routes do not read a
// browser session. Keeping them outside Proxy avoids an unnecessary Auth
// request while every authenticated workspace and API still refreshes its
// cookie before the route performs its own authorization check.
export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/rider/:path*",
    "/staff/:path*",
    "/reset-password",
    "/api/admin/:path*",
    "/api/customer/:path*",
    "/api/rider/:path*",
    "/api/staff/:path*",
    "/api/orders",
    "/api/payments/initialize",
    "/api/payments/supplemental",
    "/api/delivery/quotes/:id/:path*",
  ],
};
