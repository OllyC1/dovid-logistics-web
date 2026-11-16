import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type TestRole = "customer" | "admin" | "rider";

const adminPermissions = [
  "staff.view", "riders.invite", "riders.manage", "dispatch.manage", "bookings.manage",
  "pricing.view", "pricing.manage", "payments.view", "payments.reconcile", "reports.view",
  "zones.manage", "staff.suspend",
];

function disabled() {
  return process.env.ENABLE_E2E_ACCOUNT_PROVISIONING !== "true";
}

function authorized(request: Request) {
  const expected = process.env.E2E_ACCOUNT_PROVISIONING_SECRET;
  const supplied = request.headers.get("x-e2e-secret");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function POST(request: Request) {
  if (disabled()) return response({ error: "Not found" }, 404);
  if (!authorized(request)) return response({ error: "Unauthorized" }, 401);
  const payload = await request.json().catch(() => null) as { action?: string; roles?: TestRole[]; userIds?: string[] } | null;
  const admin = createSupabaseAdminClient();

  if (payload?.action === "cleanup") {
    const userIds = [...new Set(payload.userIds ?? [])].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (userIds.length > 12) return response({ error: "Too many test identities" }, 400);
    for (const userId of userIds) {
      await admin.from("staff_permission_grants").delete().eq("user_id", userId);
      await admin.from("staff_memberships").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    return response({ cleaned: userIds.length });
  }

  if (payload?.action !== "create") return response({ error: "Unsupported action" }, 400);
  const roles = payload.roles ?? [];
  if (!roles.length || roles.length > 3 || roles.some((role) => !["customer", "admin", "rider"].includes(role))) return response({ error: "Invalid test roles" }, 400);
  const suffix = `${Date.now()}-${randomBytes(5).toString("hex")}`;
  const accounts: Array<{ id: string; email: string; password: string; role: TestRole }> = [];

  try {
    for (const role of roles) {
      const email = `mobile-e2e-${role}-${suffix}@example.com`;
      const password = `E2e-${randomBytes(24).toString("base64url")}!`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Mobile ${role} check`, phone: "08000000000" } });
      if (created.error || !created.data.user) throw created.error ?? new Error("Test identity creation failed");
      const id = created.data.user.id;
      accounts.push({ id, email, password, role });
      const profile = await admin.from("profiles").upsert({ id, full_name: `Mobile ${role} check`, phone: "08000000000", role });
      if (profile.error) throw profile.error;
      if (role !== "customer") {
        const membership = await admin.from("staff_memberships").insert({ user_id: id, staff_role: role, status: "active", identity_verified_at: new Date().toISOString(), identity_verified_by: id, identity_verification_method: "controlled e2e account", identity_verification_reference: `mobile-${suffix}` });
        if (membership.error) throw membership.error;
      }
      if (role === "admin") {
        const grants = await admin.from("staff_permission_grants").insert(adminPermissions.map((permission_key) => ({ user_id: id, permission_key, granted_by: id })));
        if (grants.error) throw grants.error;
      }
    }
    return response({ accounts });
  } catch {
    for (const account of accounts) {
      await admin.from("staff_permission_grants").delete().eq("user_id", account.id);
      await admin.from("staff_memberships").delete().eq("user_id", account.id);
      await admin.auth.admin.deleteUser(account.id);
    }
    return response({ error: "Controlled test identity provisioning failed" }, 500);
  }
}
