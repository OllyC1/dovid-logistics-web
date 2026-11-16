import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const initialSchema = readFileSync("supabase/migrations/202611120001_initial_schema.sql", "utf8");
const pricingMigration = readFileSync("supabase/migrations/202611120002_pricing_profitability_operations.sql", "utf8");
const securityMigration = readFileSync("supabase/migrations/202611140003_security_hardening.sql", "utf8");

describe("customer account persistence", () => {
  it("creates one persistent profile for every Supabase Auth identity", () => {
    expect(initialSchema).toContain("create trigger on_auth_user_created after insert on auth.users");
    expect(initialSchema).toContain("insert into public.profiles(id, full_name, phone)");
    expect(initialSchema).toContain("on conflict (id) do nothing");
  });

  it("keeps ordinary registrations on the customer role", () => {
    expect(pricingMigration).toContain("alter table public.profiles add column role public.app_role not null default 'customer'");
    expect(initialSchema).not.toMatch(/raw_user_meta_data[^;]*role/i);
  });

  it("does not expose the profile trigger as a callable privilege escalation path", () => {
    expect(securityMigration).toContain("revoke all on function public.handle_new_user() from public, anon, authenticated");
  });
});
