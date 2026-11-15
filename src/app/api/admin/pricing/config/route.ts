import { NextResponse, type NextRequest } from "next/server";
import { validateFinancialConfig } from "@/features/pricing/engine";
import type { FinancialConfig } from "@/features/pricing/types";
import { getPricingManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";

async function adminContext() { const auth = await getAuthenticatedRole(); return auth?.role === "admin" ? auth : null; }

export async function GET() {
  const auth = await adminContext();
  if (!auth) return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const { data, error } = await auth.supabase.from("pricing_configuration_versions").select("id,version,status,effective_at,retired_at,change_reason,assumptions,created_at,updated_at,pricing_configurations(name,city,currency,timezone)").order("version", { ascending: false });
  if (error) return NextResponse.json({ error: "Pricing history could not be loaded" }, { status: 500 });
  return NextResponse.json({ versions: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await adminContext();
  if (!auth) return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const body = await request.json().catch(() => null) as { configurationId?: string; assumptions?: FinancialConfig; changeReason?: string; effectiveAt?: string } | null;
  if (!body?.configurationId || !body.assumptions || !body.changeReason || body.changeReason.trim().length < 5) return NextResponse.json({ error: "Configuration, assumptions and change reason are required" }, { status: 400 });
  try { validateFinancialConfig(body.assumptions); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid financial configuration" }, { status: 400 }); }
  const { data: latest } = await auth.supabase.from("pricing_configuration_versions").select("version").eq("pricing_configuration_id", body.configurationId).order("version", { ascending: false }).limit(1).single();
  const { data, error } = await auth.supabase.from("pricing_configuration_versions").insert({ pricing_configuration_id: body.configurationId, version: (latest?.version ?? 0) + 1, assumptions: { ...body.assumptions, version: (latest?.version ?? 0) + 1 }, status: body.effectiveAt && new Date(body.effectiveAt) > new Date() ? "scheduled" : "draft", effective_at: body.effectiveAt ?? new Date().toISOString(), change_reason: body.changeReason.trim(), created_by: auth.user.id, updated_by: auth.user.id }).select("id,version,status,effective_at").single();
  if (error) return NextResponse.json({ error: "Pricing version could not be created" }, { status: 400 });
  await auth.supabase.from("audit_logs").insert({ actor_id: auth.user.id, actor_type: "admin", action: "pricing.version.created", resource_type: "pricing_configuration_version", resource_id: data.id, metadata: { changeReason: body.changeReason } });
  return NextResponse.json(data, { status: 201 });
}
