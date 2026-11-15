import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
const schema = z.object({ reason: z.string().min(5).max(500) });
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { const auth = await getAuthenticatedRole(); if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 }); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Activation reason is required" }, { status: 400 }); const { id } = await params; const { error } = await createSupabaseAdminClient().rpc("activate_pricing_configuration_version", { target_version_id: id, reason: parsed.data.reason }); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ activated: true }); }
