import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/maps/places";
import { takeRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimit = takeRateLimit(request, "places-autocomplete", 40);
  if (rateLimit.limited) return NextResponse.json({ error: "Too many address searches. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))) } });
  const input = request.nextUrl.searchParams.get("input")?.trim() ?? "";
  const requestedToken = request.nextUrl.searchParams.get("sessionToken")?.trim() || "";
  const sessionToken = /^[A-Za-z0-9_-]{16,64}$/.test(requestedToken) ? requestedToken : undefined;
  if (input.length < 3 || input.length > 200) return NextResponse.json({ suggestions: [] });
  try {
    return NextResponse.json({ suggestions: await searchPlaces(input, sessionToken) }, { headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rateLimit.remaining) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Address search is temporarily unavailable";
    return NextResponse.json({ error: message }, { status: message.includes("configured") ? 503 : 502 });
  }
}
