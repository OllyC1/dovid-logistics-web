import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261115173941_super_admin_staff_management.sql", "utf8");
const roleMfaSql = readFileSync("supabase/migrations/20261116104004_role_specific_mfa_enforcement.sql", "utf8");

describe("Super Admin and staff management migration", () => {
  it("preserves application-role compatibility while separating elevated staff roles", () => {
    expect(sql).toContain("create type public.staff_role as enum ('super_admin', 'admin', 'rider')");
    expect(sql).toContain("when membership.staff_role='rider' then 'rider'::public.app_role else 'admin'::public.app_role");
    expect(sql).not.toContain("alter type public.app_role add value");
  });

  it("requires verified email, password and TOTP before founder activation", () => {
    expect(sql).toContain("email_confirmed_at is not null");
    expect(sql).toContain("encrypted_password is not null");
    expect(sql).toContain("factor_type::text='totp'");
    expect(sql).toContain("status::text='verified'");
  });

  it("makes privileged procedures service-only and disables legacy self-bootstrap", () => {
    expect(sql).toContain("legacy role assignment is disabled; use the staff invitation workflow");
    expect(sql).toContain("revoke all on function public.finalize_initial_super_admin(uuid) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.finalize_initial_super_admin(uuid) to service_role");
  });

  it("prevents delegated Super Admin permissions and protects the last Super Admin", () => {
    expect(sql).toContain("Super Admin permissions cannot be delegated");
    expect(sql).toContain("the last active Super Admin cannot be suspended or revoked");
  });

  it("keeps staff audit history immutable", () => {
    expect(sql).toContain("staff audit history is immutable");
    expect(sql).toContain("before update or delete on public.staff_audit_events");
  });

  it("requires AAL2 only for the Super Admin membership", () => {
    expect(roleMfaSql).toContain("membership.staff_role<>'super_admin'");
    expect(roleMfaSql).toContain("auth.jwt()->>'aal')='aal2'");
    expect(roleMfaSql).toContain("membership.staff_role='rider'");
  });
});
