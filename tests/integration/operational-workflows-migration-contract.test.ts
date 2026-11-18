import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261115163957_operational_workflows_and_onboarding.sql", "utf8");
const pricingHardeningSql = readFileSync("supabase/migrations/20261115164500_pricing_activation_rpc_hardening.sql", "utf8");
const pricingActorAuditSql = readFileSync("supabase/migrations/20261118170636_pricing_activation_actor_audit.sql", "utf8");
const riderOrderPage = readFileSync("src/app/(rider)/rider/orders/[id]/page.tsx", "utf8");

describe("operational workflows migration", () => {
  it("keeps privileged assignments verified, explicit and service-role only", () => {
    expect(sql).toContain("email_confirmed_at is not null");
    expect(sql).toContain("initial administrator must be explicitly self-bootstrapped");
    expect(sql).toContain("revoke all on function public.assign_verified_application_role");
  });

  it("makes redelivery and attempt resolution atomic", () => {
    expect(sql).toContain("function public.request_order_redelivery");
    expect(sql).toContain("function public.resolve_delivery_attempt");
    expect(sql).toContain("resolution_idempotency_key");
  });

  it("blocks run completion until custody reaches a terminal state", () => {
    expect(sql).toContain("all parcel assignments must reach a terminal custody state");
    expect(sql).toContain("delivered parcels require completed custody records");
    expect(sql).toContain("returned parcels require return custody records");
  });

  it("switches the rider workspace from receiver handover controls to return custody", () => {
    expect(riderOrderPage).toContain("Return authorized by dispatch");
    expect(riderOrderPage).toContain("returnInProgress={Boolean(returningAssignment)}");
    expect(riderOrderPage).toContain("!returningAssignment ? <DeliveryProofForm");
  });
});

describe("pricing activation RPC hardening", () => {
  it("moves pricing activation behind server-only authorization", () => {
    expect(pricingHardeningSql).toContain("revoke execute on function public.activate_rate_card(uuid) from authenticated");
    expect(pricingHardeningSql).toContain("to service_role");
  });

  it("preserves the authorized actor and approval reason across the server-only boundary", () => {
    expect(pricingActorAuditSql).toContain("activate_pricing_configuration_version(");
    expect(pricingActorAuditSql).toContain("activate_rate_card(");
    expect(pricingActorAuditSql).toContain("permission.permission_key='pricing.manage'");
    expect(pricingActorAuditSql).toContain("jsonb_build_object('reason',trim(reason)");
    expect(pricingActorAuditSql).toContain("to service_role");
    expect(pricingActorAuditSql).toContain("from public,anon,authenticated");
  });
});
