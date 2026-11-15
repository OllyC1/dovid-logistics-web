import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ otp: z.string().regex(/^\d{6}$/) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the six-digit verification code." }, { status: 400 });
  const verificationSession = randomBytes(32).toString("base64url");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("verify_assisted_quote_access", {
    access_token_hash: hashAssistedSecret(token),
    submitted_otp_hash: hashAssistedSecret(parsed.data.otp),
    new_verification_session_hash: hashAssistedSecret(verificationSession),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  const response = NextResponse.json({ verified: true });
  response.cookies.set("dovid_assisted_verification", verificationSession, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 30 * 60, path: "/" });
  return response;
}

