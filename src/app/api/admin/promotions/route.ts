import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSuperAdminAuthorization } from "@/lib/auth/staff";

const schema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),
  kind: z.enum(["fixed", "percentage", "fixed_price"]),
  value: z.number().int().positive(),
  maximumDiscountKobo: z.number().int().positive().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
});

export async function POST(request: NextRequest) {
  const auth = await getSuperAdminAuthorization();
  if (!auth) return NextResponse.json({ error: "Only the Super Admin can create promotions." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the discount code, value and dates." }, { status: 400 });
  if (parsed.data.kind === "percentage" && parsed.data.value > 10_000) return NextResponse.json({ error: "Percentage discounts cannot exceed 100%." }, { status: 400 });
  if (parsed.data.endsAt && new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt)) return NextResponse.json({ error: "The end date must be after the start date." }, { status: 400 });
  const { data, error } = await auth.admin.from("promotions").insert({ code: parsed.data.code, kind: parsed.data.kind, value: parsed.data.value, maximum_discount_kobo: parsed.data.maximumDiscountKobo, stackable: false, active: false, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, eligibility: {}, created_by: auth.user.id }).select("id,code").single();
  if (error || !data) return NextResponse.json({ error: error?.code === "23505" ? "That promotion code already exists." : "The promotion could not be created." }, { status: 409 });
  await auth.admin.from("audit_logs").insert({ actor_id: auth.user.id, actor_type: "admin", action: "promotion.created", resource_type: "promotion", resource_id: data.id, metadata: { code: data.code, kind: parsed.data.kind, active: false } });
  return NextResponse.json(data, { status: 201 });
}
