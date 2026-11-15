import { NextRequest, NextResponse } from "next/server";
import { getPlaceDetails } from "@/lib/maps/places";
import { takeRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  const rateLimit = takeRateLimit(request, "place-details", 30);
  if (rateLimit.limited) return NextResponse.json({ error: "Too many address confirmations. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))) } });
  const { placeId } = await params;
  if (!placeId || placeId.length > 300) return NextResponse.json({ error: "Choose an address from the suggestions." }, { status: 400 });
  const requestedToken = request.nextUrl.searchParams.get("sessionToken")?.trim() || "";
  const sessionToken = /^[A-Za-z0-9_-]{16,64}$/.test(requestedToken) ? requestedToken : undefined;
  try {
    return NextResponse.json(await getPlaceDetails(placeId, sessionToken), { headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rateLimit.remaining) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "That address could not be confirmed";
    return NextResponse.json({ error: message }, { status: message.includes("configured") ? 503 : 502 });
  }
}
