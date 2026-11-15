import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ kind: z.enum(["contact", "business"]), name: z.string().min(2).max(120), email: z.email(), phone: z.string().max(30).optional(), company: z.string().max(180).optional(), subject: z.string().min(3).max(180), message: z.string().min(10).max(4000), website: z.string().max(0).optional() });
const attempts = new Map<string, number>();
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown"; const last = attempts.get(ip) ?? 0;
  if (Date.now() - last < 20_000) return NextResponse.json({ error: "Please wait before sending another message." }, { status: 429 });
  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success || parsed.data.website) return NextResponse.json({ error: "Check the form and try again." }, { status: 400 });
  try { const admin = createSupabaseAdminClient(); const table = parsed.data.kind === "business" ? "business_enquiries" : "support_requests"; const { error } = await admin.from(table).insert({ name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone || null, company_name: parsed.data.company || null, subject: parsed.data.subject, message: parsed.data.message, source: "website" }); if (error) throw error; attempts.set(ip, Date.now()); return NextResponse.json({ message: "Thanks — your enquiry has been received." }); } catch { return NextResponse.json({ error: "Enquiries are unavailable until the database is configured." }, { status: 503 }); }
}
