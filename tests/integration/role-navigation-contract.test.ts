import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authForm = readFileSync("src/components/account/auth-form.tsx", "utf8");
const field = readFileSync("src/components/ui/field.tsx", "utf8");
const header = readFileSync("src/components/layout/header.tsx", "utf8");
const footer = readFileSync("src/components/layout/footer.tsx", "utf8");
const customerLayout = readFileSync("src/app/(customer)/account/layout.tsx", "utf8");
const adminLayout = readFileSync("src/app/(admin)/admin/layout.tsx", "utf8");
const riderLayout = readFileSync("src/app/(rider)/rider/layout.tsx", "utf8");

describe("role-specific authentication and navigation", () => {
  it("offers accessible show and hide password controls", () => {
    expect(authForm).toContain("<PasswordField");
    expect(field).toContain('aria-label={visible ? "Hide password" : "Show password"}');
    expect(field).toContain('aria-pressed={visible}');
  });

  it("removes public site chrome from private workspaces", () => {
    expect(header).toContain("isWorkspacePath(pathname)");
    expect(footer).toContain("isWorkspacePath(pathname)");
  });

  it("keeps customer, admin and rider menus separate", () => {
    expect(customerLayout).toContain("if(staffHome)redirect(staffHome)");
    expect(adminLayout).toContain('auth.staffRole==="super_admin"?"Super Admin":"Dovid admin"');
    expect(adminLayout).toContain("visibleLinks");
    expect(riderLayout).toContain('label="Rider workspace"');
  });
});
