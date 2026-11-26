import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261126051214_gate_sender_dispatch_on_verified_payment.sql",
  "utf8"
);
const refinementMigration = readFileSync(
  "supabase/migrations/20261126082915_refine_sender_dispatch_clearance_transition.sql",
  "utf8"
);
const orderRoute = readFileSync("src/app/api/orders/route.ts", "utf8");

describe("payment-gated dispatch contract", () => {
  it("keeps booking creation non-blocking while unpaid sender orders remain unassigned", () => {
    expect(orderRoute).toContain('rpc("auto_assign_delivery_order"');
    expect(migration).toContain("if selected_order.payer = 'sender'");
    expect(migration).toContain("not public.order_has_verified_payment_clearance(selected_order.id)");
    expect(migration).toContain("return null;");
  });

  it("enforces the sender-payment invariant below every assignment path", () => {
    expect(migration).toContain("sender_dispatch_clearance_on_insert");
    expect(migration).toContain("sender_dispatch_clearance_on_update");
    expect(migration).toContain("before update of rider_id, delivery_status");
    expect(migration).toContain("sender payment clearance required before assignment");
    expect(refinementMigration).toContain("not old_dispatch_state and new_dispatch_state");
    expect(refinementMigration).toContain("new.rider_id is distinct from old.rider_id");
  });

  it("assigns after genuine settlement without rolling back immutable payment evidence", () => {
    expect(migration).toContain("sender_auto_assignment_after_payment");
    expect(migration).toContain("after update of payment_status");
    expect(migration).toContain("perform public.auto_assign_delivery_order(new.id)");
    expect(migration).toContain("dispatch.auto_assignment_failed_after_payment");
  });

  it("keeps privileged functions unavailable to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function public.auto_assign_delivery_order(uuid)\n  from public, anon, authenticated"
    );
    expect(migration).toContain(
      "revoke all on function private.enforce_sender_dispatch_payment_clearance()\n  from public, anon, authenticated"
    );
    expect(refinementMigration).toContain(
      "revoke all on function private.enforce_sender_dispatch_payment_clearance()\n  from public, anon, authenticated"
    );
  });
});
