import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStaffAuthorization } from "@/lib/auth/staff";

const permissionKeys = ["staff.view","riders.invite","riders.manage","dispatch.manage","bookings.manage","pricing.view","pricing.manage","payments.view","payments.reconcile","reports.view","zones.manage","staff.suspend"] as const;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), verificationMethod: z.string().trim().min(4).max(100), verificationReference: z.string().trim().min(4).max(200), reason: z.string().trim().min(8).max(1000) }),
  z.object({ action: z.literal("status"), status: z.enum(["active", "suspended", "revoked"]), reason: z.string().trim().min(8).max(1000) }),
  z.object({ action: z.literal("permissions"), permissions: z.array(z.enum(permissionKeys)).max(permissionKeys.length), reason: z.string().trim().min(8).max(1000) }),
  z.object({ action: z.literal("profile"), firstName: z.string().trim().min(2).max(60), lastName: z.string().trim().min(2).max(60), preferredName: z.string().trim().min(2).max(60).nullable(), fullName: z.string().trim().min(2).max(180), phone: z.string().trim().min(7).max(30).nullable(), reason: z.string().trim().min(8).max(1000) })
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getStaffAuthorization();
  if (!auth) return NextResponse.json({ error: "Verified staff authorization is required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the requested staff action and provide a clear reason." }, { status: 400 });
  const targetUserId = (await params).id;
  const { data: target } = await auth.admin.from("staff_memberships").select("staff_role,status").eq("user_id", targetUserId).maybeSingle();
  if (!target) return NextResponse.json({ error: "Staff membership not found." }, { status: 404 });
  if (parsed.data.action === "status" && targetUserId === auth.user.id) return NextResponse.json({ error: "You cannot suspend, revoke or reactivate your own account." }, { status: 409 });
  if (parsed.data.action === "status" && target.staff_role === "super_admin") return NextResponse.json({ error: "The initial Super Admin cannot be changed through routine staff controls." }, { status: 409 });
  if (target.staff_role !== "rider" && auth.staffRole !== "super_admin") return NextResponse.json({ error: "Only a Super Admin can manage administrators." }, { status: 403 });
  if (target.staff_role === "rider" && auth.staffRole !== "super_admin" && !auth.permissions.includes("riders.manage")) return NextResponse.json({ error: "Rider management permission is required." }, { status: 403 });

  let result;
  if (parsed.data.action === "activate") {
    result = await auth.admin.rpc("activate_staff_member", { target_user_id: targetUserId, actor_id: auth.user.id, verification_method: parsed.data.verificationMethod, verification_reference: parsed.data.verificationReference, activation_reason: parsed.data.reason });
  } else if (parsed.data.action === "permissions") {
    if (auth.staffRole !== "super_admin") return NextResponse.json({ error: "Only a Super Admin can change administrator permissions." }, { status: 403 });
    result = await auth.admin.rpc("replace_staff_permissions", { target_user_id: targetUserId, actor_id: auth.user.id, requested_permissions: parsed.data.permissions, change_reason: parsed.data.reason });
  } else if (parsed.data.action === "status") {
    result = await auth.admin.rpc("set_staff_member_status", { target_user_id: targetUserId, actor_id: auth.user.id, next_status: parsed.data.status, change_reason: parsed.data.reason });
  } else {
    result = await auth.admin.rpc("update_staff_profile_record", { target_user_id: targetUserId, action_actor_id: auth.user.id, target_first_name: parsed.data.firstName, target_last_name: parsed.data.lastName, target_preferred_name: parsed.data.preferredName ?? "", target_full_name: parsed.data.fullName, target_phone: parsed.data.phone ?? "", change_reason: parsed.data.reason });
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 409 });
  return NextResponse.json(result.data);
}
