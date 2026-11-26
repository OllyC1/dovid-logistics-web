import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isRealVehicleRegistration } from "@/features/fleet/registration";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  registrationNumber: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9 -]+$/),
  registrationVerified: z.boolean(),
  registrationVerificationMethod: z.string().trim().max(100).nullable(),
  registrationVerificationReference: z.string().trim().max(200).nullable(),
  manufacturer: z.string().trim().min(2).max(60).nullable(),
  model: z.string().trim().min(1).max(60).nullable(),
  modelYear: z.number().int().min(1980).max(2100).nullable(),
  assignedRiderId: z.uuid().nullable(),
  operationalStatus: z.enum(["offline", "available", "assigned", "maintenance", "suspended"]),
  safetyStatus: z.enum(["cleared", "review_required", "blocked"]),
  maxActiveAssignments: z.number().int().min(1).max(10),
  maxPayloadWeightGrams: z.number().int().positive().nullable(),
  cargoLengthMm: z.number().int().positive().nullable(),
  cargoWidthMm: z.number().int().positive().nullable(),
  cargoHeightMm: z.number().int().positive().nullable(),
  capacityVerified: z.boolean(),
  reason: z.string().trim().min(8).max(1_000),
}).superRefine((value, context) => {
  if (value.capacityVerified && (!value.maxPayloadWeightGrams || !value.cargoLengthMm || !value.cargoWidthMm || !value.cargoHeightMm)) context.addIssue({ code: "custom", message: "Measured payload and all cargo dimensions are required before capacity verification." });
  if (value.registrationVerified && (!value.manufacturer || !value.model || !value.modelYear)) context.addIssue({ code: "custom", message: "Manufacturer, model and model year are required before registration verification." });
  if (value.registrationVerified && (!value.registrationVerificationMethod || value.registrationVerificationMethod.length < 4 || !value.registrationVerificationReference || value.registrationVerificationReference.length < 4)) context.addIssue({ code: "custom", message: "Record how the physical plate was checked and the evidence reference." });
  if ((value.assignedRiderId || ["available", "assigned"].includes(value.operationalStatus)) && !isRealVehicleRegistration(value.registrationNumber)) context.addIssue({ code: "custom", path: ["registrationNumber"], message: "Replace the temporary registration with the motorcycle's real plate before assigning a rider or making it available." });
  if (["available", "assigned"].includes(value.operationalStatus) && !value.registrationVerified) context.addIssue({ code: "custom", message: "Verify the physical plate and registration evidence before making this motorcycle available." });
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
  const [{ data: currentVehicle }, { data: activeAssignments }, { data: activeRuns }] = await Promise.all([
    admin.from("fleet_vehicles").select("registration_number,registration_verification_reference").eq("id", id).maybeSingle(),
    admin.from("delivery_assignments").select("id,order_id").eq("vehicle_id", id).is("released_at", null),
    admin.from("delivery_runs").select("id,run_reference,status").eq("vehicle_id", id).in("status", ["planned", "active", "paused"]),
  ]);
  if (!currentVehicle) return NextResponse.json({ error: "Motorcycle not found." }, { status: 404 });
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
  const normalizedRegistration = parsed.data.registrationNumber.trim().replace(/\s+/g, " ").toUpperCase();
  const registrationChanged = normalizedRegistration !== currentVehicle.registration_number;
  if (registrationChanged && parsed.data.registrationVerified && parsed.data.registrationVerificationReference === currentVehicle.registration_verification_reference) {
    return NextResponse.json({ error: "The plate changed. Record a new evidence reference for the new physical registration." }, { status: 400 });
  }
  const { error } = await admin.rpc("update_fleet_vehicle_configuration", {
    target_vehicle_id: id,
    actor_id: auth.user.id,
    new_registration_number: normalizedRegistration,
    new_registration_verified: parsed.data.registrationVerified,
    new_registration_verification_method: parsed.data.registrationVerificationMethod,
    new_registration_verification_reference: parsed.data.registrationVerificationReference,
    new_manufacturer: parsed.data.manufacturer,
    new_model: parsed.data.model,
    new_model_year: parsed.data.modelYear,
    new_assigned_rider_id: parsed.data.assignedRiderId,
    new_operational_status: parsed.data.operationalStatus,
    new_safety_status: parsed.data.safetyStatus,
    new_max_active_assignments: parsed.data.maxActiveAssignments,
    new_max_payload_weight_grams: parsed.data.maxPayloadWeightGrams,
    new_cargo_length_mm: parsed.data.cargoLengthMm,
    new_cargo_width_mm: parsed.data.cargoWidthMm,
    new_cargo_height_mm: parsed.data.cargoHeightMm,
    new_capacity_verified: parsed.data.capacityVerified,
    change_reason: parsed.data.reason,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That plate number or rider is already assigned to another bike." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ saved: true });
}
