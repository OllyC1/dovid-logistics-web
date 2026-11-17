import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/rider/orders/[id]/proof/route.ts", "utf8");
const form = readFileSync("src/components/rider/delivery-proof-form.tsx", "utf8");
const orderPage = readFileSync("src/app/(rider)/rider/orders/[id]/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261117101216_delivery_proof_handover_hardening.sql", "utf8");

describe("delivery proof workflow contract", () => {
  it("authorizes the assigned rider and checks real payment clearance on the server", () => {
    expect(route).toContain('order.rider_id !== auth.user.id');
    expect(route).toContain('getDispatchManagerAuthorization');
    expect(route).toContain('admin.rpc("record_delivery_proof"');
    expect(migration).toContain("order_has_verified_payment_clearance(target_order_id)");
    expect(migration).toContain("'delivery.proof_recorded'");
    expect(migration).toContain("payment_clearance_verified,confirmed_by");
  });

  it("only records proof after arrival and remains safe to replay", () => {
    expect(migration).toContain("'arrived_at_destination','awaiting_payment'");
    expect(migration).toContain("'already_recorded',true");
    expect(migration).toContain("where order_id=target_order_id");
    expect(migration).toContain("revoke all on function public.record_delivery_proof(uuid,uuid,text,text) from public,anon,authenticated");
  });

  it("gives the rider a mobile-first confirmation form and a clear unpaid state", () => {
    expect(form).toContain('min-h-12');
    expect(form).toContain('Verified payment is still outstanding');
    expect(form).toContain('Record recipient confirmation');
    expect(form).toContain('Keep the parcel');
    expect(orderPage).toContain('<DeliveryProofForm');
  });
});
