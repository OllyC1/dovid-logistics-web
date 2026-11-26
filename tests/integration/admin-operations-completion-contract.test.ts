import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261117180000_admin_operations_completion.sql", "utf8");
const assistedSchema = readFileSync("src/features/assisted-bookings/schema.ts", "utf8");
const teamApi = readFileSync("src/app/api/admin/team/members/[id]/route.ts", "utf8");
const invitationApi = readFileSync("src/app/api/admin/team/invitations/route.ts", "utf8");
const invitationEmail = readFileSync("src/lib/notifications/staff-invitation-email.ts", "utf8");
const promotionApi = readFileSync("src/app/api/admin/promotions/route.ts", "utf8");

describe("admin operations completion contract", () => {
  it("keeps assisted-booking email optional while persisting it separately", () => {
    expect(assistedSchema).toContain("customerEmail: z.email().max(254).optional()");
    expect(migration).toContain("add column if not exists customer_email text");
  });

  it("prevents staff self-suspension and routine super-admin status changes", () => {
    expect(teamApi).toContain("targetUserId === auth.user.id");
    expect(teamApi).toContain('target.staff_role === "super_admin"');
  });

  it("restricts promotion creation to the trusted super-admin resolver", () => {
    expect(promotionApi).toContain("getSuperAdminAuthorization");
    expect(promotionApi).toContain('active: false');
    expect(migration).toContain("'fixed_price'");
  });

  it("rolls back only newly created identities when staff invitation registration fails", () => {
    expect(invitationApi).toContain("createdForInvitation");
    expect(invitationApi).toContain("removeUnregisteredInvitationIdentity");
    expect(invitationApi).toContain("This identity already has a staff membership");
    expect(invitationApi).toContain("An active invitation already exists for this email");
  });

  it("does not disguise an existing-user staff invitation as password recovery", () => {
    expect(invitationApi).not.toContain("resetPasswordForEmail");
    expect(invitationApi).toContain("queueExistingUserStaffInvitation");
    expect(invitationEmail).toContain('event_type: "staff_invitation_existing_user"');
    expect(invitationEmail).toContain('actionPath: "/login"');
  });
});
