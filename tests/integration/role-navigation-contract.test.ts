import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authForm = readFileSync("src/components/account/auth-form.tsx", "utf8");
const field = readFileSync("src/components/ui/field.tsx", "utf8");
const header = readFileSync("src/components/layout/header.tsx", "utf8");
const footer = readFileSync("src/components/layout/footer.tsx", "utf8");
const customerLayout = readFileSync("src/app/(customer)/account/layout.tsx", "utf8");
const adminLayout = readFileSync("src/app/(admin)/admin/layout.tsx", "utf8");
const riderLayout = readFileSync("src/app/(rider)/rider/layout.tsx", "utf8");
const teamPage = readFileSync("src/app/(admin)/admin/team/page.tsx", "utf8");
const loginActions = readFileSync("src/features/auth/actions.ts", "utf8");
const staffSetup = readFileSync("src/app/staff/setup/page.tsx", "utf8");
const workspaceNavigation = readFileSync("src/components/layout/workspace-navigation.tsx", "utf8");
const transitionIndicator = readFileSync("src/components/layout/route-transition-indicator.tsx", "utf8");
const button = readFileSync("src/components/ui/button.tsx", "utf8");
const logoutButton = readFileSync("src/components/account/logout-button.tsx", "utf8");
const signedOutNotice = readFileSync("src/components/account/signed-out-notice.tsx", "utf8");

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

  it("closes mobile workspace navigation and shows the active page", () => {
    expect(workspaceNavigation).toContain('mobileMenu.current?.removeAttribute("open")');
    expect(workspaceNavigation).toContain('aria-current={active ? "page" : undefined}');
  });

  it("provides immediate feedback while internal pages are opening", () => {
    expect(transitionIndicator).toContain('document.addEventListener("click", start, true)');
    expect(transitionIndicator).toContain("Opening page…");
  });

  it("closes the public mobile menu on button links and explains sign-out progress", () => {
    expect(header).toContain('<Button href="/login" variant="outline" onClick={closeMobileMenu}>');
    expect(button).toContain("<Link className={buttonClasses(className, variant)} href={href} {...props}>");
    expect(logoutButton).toContain('pending ? "Signing out…" : "Log out"');
    expect(loginActions).toContain('redirect("/?signedOut=1")');
    expect(signedOutNotice).toContain("You’re signed out. See you again soon.");
  });

  it("loads pending staff separately from profiles and limits MFA to Super Admin", () => {
    expect(teamPage).toContain('session.staffRole === "super_admin" && session.currentAal !== "aal2"');
    expect(teamPage).toContain('auth.admin.from("profiles").select("id,full_name,phone")');
    expect(teamPage).not.toContain("profiles(full_name,phone)");
    expect(teamPage).toContain("if (membershipResult.error)");
  });

  it("never lets an accepted invitation override an active staff membership", () => {
    expect(loginActions).toContain('staffStatus !== "active" && invitation ? "/staff/setup"');
    expect(staffSetup).toContain('if (membership?.status === "active")');
    expect(staffSetup).toContain('if (membership.staff_role === "rider") redirect("/rider")');
    expect(staffSetup).toContain('redirect("/admin")');
  });
});
