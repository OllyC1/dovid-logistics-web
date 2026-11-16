import { describe, expect, it } from "vitest";
import {
  activeStaffHome,
  isWorkspacePath,
  postLoginDestination,
  resolveTrustedAppRole,
  roleHome,
} from "@/lib/auth/role-resolution";

describe("trusted role resolution", () => {
  it("routes an active Super Admin to the admin workspace after MFA", () => {
    expect(resolveTrustedAppRole("super_admin", "active", "aal2")).toBe("admin");
    expect(postLoginDestination("super_admin", "active", "aal2")).toBe("/admin");
  });

  it("requires MFA before exposing the active Super Admin role", () => {
    expect(resolveTrustedAppRole("super_admin", "active", "aal1")).toBe("customer");
    expect(postLoginDestination("super_admin", "active", "aal1")).toBe("/staff/mfa?next=/admin");
  });

  it("does not require MFA for regular admins or riders", () => {
    expect(resolveTrustedAppRole("admin", "active", "aal1")).toBe("admin");
    expect(resolveTrustedAppRole("rider", "active", "aal1")).toBe("rider");
    expect(postLoginDestination("admin", "active", "aal1")).toBe("/admin");
    expect(postLoginDestination("rider", "active", "aal1")).toBe("/rider");
  });

  it("keeps accepted staff invitations in onboarding until approval", () => {
    expect(postLoginDestination("admin", "pending", "aal1")).toBe("/staff/setup");
    expect(postLoginDestination("rider", "pending", "aal1")).toBe("/staff/setup");
  });

  it("routes active admins, riders and customers to separate workspaces", () => {
    expect(activeStaffHome("admin", "active")).toBe("/admin");
    expect(activeStaffHome("rider", "active")).toBe("/rider");
    expect(postLoginDestination(null, null, "aal2")).toBe("/account");
    expect(roleHome("customer")).toBe("/account");
    expect(roleHome("rider")).toBe("/rider");
    expect(roleHome("admin")).toBe("/admin");
  });

  it("never grants staff access from inactive or absent membership data", () => {
    expect(resolveTrustedAppRole("admin", "suspended", "aal2")).toBe("customer");
    expect(resolveTrustedAppRole("rider", "revoked", "aal2")).toBe("customer");
    expect(resolveTrustedAppRole(null, null, "aal2")).toBe("customer");
  });

  it("identifies every private workspace route", () => {
    for (const path of ["/account", "/account/orders", "/admin", "/admin/team", "/rider", "/rider/performance", "/staff/mfa"]) {
      expect(isWorkspacePath(path)).toBe(true);
    }
    expect(isWorkspacePath("/login")).toBe(false);
    expect(isWorkspacePath("/pricing")).toBe(false);
  });
});
