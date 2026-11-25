import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isRealVehicleRegistration } from "@/features/fleet/registration";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ registrationNumber: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9 -]+$/), manufacturer: z.string().trim().min(2).max(60).nullable(), model: z.string().trim().min(1).max(60).nullable(), modelYear: z.number().int().min(1980).max(2100).nullable(), assignedRiderId: z.uuid().nullable(), operationalStatus: z.enum(["offline", "available", "maintenance", "suspended"]), safetyStatus: z.enum(["cleared", "review_required", "blocked"]), maxActiveAssignments: z.number().int().min(1).max(5), maxPayloadWeightGrams: z.number().int().positive().nullable(), cargoLengthMm: z.number().int().positive().nullable(), cargoWidthMm: z.number().int().positive().nullable(), cargoHeightMm: z.number().int().positive().nullable(), capacityVerified: z.boolean(), reason: z.string().trim().min(8).max(1_000) }).superRefine((value, context) => {
  if (value.capacityVerified && (!value.maxPayloadWeightGrams || !value.cargoLengthMm || !value.cargoWidthMm || !value.cargoHeightMm)) context.addIssue({ code: "custom", message: "Measured payload and all cargo dimensions are required before capacity verification." });
  if ((value.assignedRiderId || value.operationalStatus === "available") && !isRealVehicleRegistration(value.registrationNumber)) context.addIssue({ code: "custom", path: ["registrationNumber"], message: "Replace the temporary registration with the motorcycle's real plate before assigning a rider or making it available." });
});
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth) return NextResponse.json({ error: "Dispatch manager authorization required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the bike status, rider and reason." }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (parsed.data.assignedRiderId) {
    const [{ data: riderMembership }, { data: riderProfile }] = await Promise.all([
      admin.from("staff_memberships").select("user_id").eq("user_id", parsed.data.assignedRiderId).eq("staff_role", "rider").eq("status", "active").maybeSingle(),
      admin.from("profiles").select("id,full_name,role").eq("id", parsed.data.assignedRiderId).eq("role", "rider").maybeSingle(),
    ]);
    if (!riderMembership || !riderProfile?.full_name?.trim()) return NextResponse.json({ error: "Choose an active rider whose name has been recorded." }, { status: 400 });
  }
  const [{ data: activeAssignments }, { data: activeRuns }] = await Promise.all([
    admin.from("delivery_assignments").select("id,order_id").eq("vehicle_id", id).is("released_at", null),
    admin.from("delivery_runs").select("id,run_reference,status").eq("vehicle_id", id).in("status", ["planned", "active", "paused"]),
  ]);
  if ((activeAssignments?.length ?? 0) > 0 || (activeRuns?.length ?? 0) > 0) {
    const orderIds = (activeAssignments ?? []).map((assignment) => assignment.order_id);
    const { data: orders } = orderIds.length
      ? await admin.from("delivery_orders").select("id,order_reference").in("id", orderIds)
      : { data: [] as { id: string; order_reference: string }[] };
    return NextResponse.json({
      error: "This bike is still committed to an active delivery. Complete or cancel that delivery before changing its rider or availability.",
      activeAssignments: (activeAssignments ?? []).map((assignment) => ({
        orderReference: orders?.find((order) => order.id === assignment.order_id)?.order_reference ?? assignment.order_id,
      })),
      activeRuns: (activeRuns ?? []).map((run) => ({ reference: run.run_reference, status: run.status })),
    }, { status: 409 });
  }
  const { error } = await admin.from("fleet_vehicles").update({ registration_number: parsed.data.registrationNumber, manufacturer: parsed.data.manufacturer, model: parsed.data.model, model_year: parsed.data.modelYear, assigned_rider_id: parsed.data.assignedRiderId, operational_status: parsed.data.operationalStatus, safety_status: parsed.data.safetyStatus, max_active_assignments: parsed.data.maxActiveAssignments, max_payload_weight_grams: parsed.data.maxPayloadWeightGrams, cargo_length_mm: parsed.data.cargoLengthMm, cargo_width_mm: parsed.data.cargoWidthMm, cargo_height_mm: parsed.data.cargoHeightMm, capacity_verified_at: parsed.data.capacityVerified ? new Date().toISOString() : null, capacity_verified_by: parsed.data.capacityVerified ? auth.user.id : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That plate number or rider is already assigned to another bike." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await admin.from("audit_logs").insert({ actor_id: auth.user.id, actor_type: "admin", action: "fleet.vehicle.updated", resource_type: "fleet_vehicle", resource_id: id, metadata: { ...parsed.data } });
  return NextResponse.json({ saved: true });
}
