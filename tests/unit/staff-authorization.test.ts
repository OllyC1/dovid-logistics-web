import { describe, expect, it } from "vitest";
import { canInviteRole } from "@/lib/auth/staff";

describe("staff invitation authorization", () => {
  it("allows only a Super Admin to invite administrators", () => {
    expect(canInviteRole("super_admin", ["*"], "admin")).toBe(true);
    expect(canInviteRole("admin", ["admins.invite"], "admin")).toBe(false);
  });

  it("allows an explicitly permitted administrator to invite riders", () => {
    expect(canInviteRole("admin", ["riders.invite"], "rider")).toBe(true);
    expect(canInviteRole("admin", ["staff.view"], "rider")).toBe(false);
  });
});
