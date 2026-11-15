import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getZonesManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const dayWindow = z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]).nullable();
const schema = z.object({
  serviceAreaId: z.uuid(),
  standardMaxDistanceMeters: z.number().int().min(1_000).max(100_000),
  manualMaxDistanceMeters: z.number().int().min(1_001).max(200_000),
  maxActiveAssignmentsPerRider: z.number().int().min(1).max(10),
  standardPackageSizes: z.array(z.enum(["small", "medium", "large"])).min(1),
  oversizedRequiresManualApproval: z.boolean(),
  serviceHours: z.object({ timezone: z.literal("Africa/Lagos"), monday: dayWindow, tuesday: dayWindow, wednesday: dayWindow, thursday: dayWindow, friday: dayWindow, saturday: dayWindow, sunday: dayWindow }),
  sameDayBookingCutoff: z.string().regex(/^\d{2}:\d{2}$/),
  handoverBufferMinutes: z.number().int().min(0).max(240).nullable(),
  safeCompletionBufferMinutes: z.number().int().min(0).max(240).nullable(),
  waitingFreeMinutes: z.number().int().min(0).max(240).nullable(),
  waitingFeePerMinuteKobo: z.number().int().nonnegative().nullable(),
  maximumContinuousRidingMinutes: z.number().int().min(15).max(480).nullable(),
  minimumBreakMinutes: z.number().int().min(5).max(180).nullable(),
  motorcycleRestrictionsConfirmed: z.boolean(),
  motorcycleRestrictionsNotes: z.string().trim().max(2_000).nullable()
}).refine((value) => value.manualMaxDistanceMeters > value.standardMaxDistanceMeters, { message: "Manual threshold must be above standard threshold.", path: ["manualMaxDistanceMeters"] });

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the operational thresholds.", issues: parsed.error.flatten() }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("service_area_operational_settings").update({
    standard_max_distance_meters: parsed.data.standardMaxDistanceMeters,
    manual_max_distance_meters: parsed.data.manualMaxDistanceMeters,
    max_active_assignments_per_rider: parsed.data.maxActiveAssignmentsPerRider,
    standard_package_sizes: parsed.data.standardPackageSizes,
    oversized_requires_manual_approval: parsed.data.oversizedRequiresManualApproval,
    service_hours: parsed.data.serviceHours,
    same_day_booking_cutoff: parsed.data.sameDayBookingCutoff,
    handover_buffer_minutes: parsed.data.handoverBufferMinutes,
    safe_completion_buffer_minutes: parsed.data.safeCompletionBufferMinutes,
    waiting_free_minutes: parsed.data.waitingFreeMinutes,
    waiting_fee_per_minute_kobo: parsed.data.waitingFeePerMinuteKobo,
    maximum_continuous_riding_minutes: parsed.data.maximumContinuousRidingMinutes,
    minimum_break_minutes: parsed.data.minimumBreakMinutes,
    motorcycle_restrictions_confirmed_at: parsed.data.motorcycleRestrictionsConfirmed ? new Date().toISOString() : null,
    motorcycle_restrictions_confirmed_by: parsed.data.motorcycleRestrictionsConfirmed ? auth.user.id : null,
    motorcycle_restrictions_notes: parsed.data.motorcycleRestrictionsNotes,
    updated_by: auth.user.id,
    updated_at: new Date().toISOString()
  }).eq("service_area_id", parsed.data.serviceAreaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved: true });
}
