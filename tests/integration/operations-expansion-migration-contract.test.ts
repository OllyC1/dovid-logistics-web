import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202611140006_operations_expansion.sql", "utf8");
const concurrencySql = readFileSync("supabase/migrations/202611140007_operations_concurrency_fixes.sql", "utf8");
const routeMetricsSql = readFileSync("supabase/migrations/202611140008_delivery_run_route_metrics.sql", "utf8");
const capacityHardeningSql = readFileSync("supabase/migrations/20261126163300_harden_delivery_run_capacity.sql", "utf8");
const runAssignmentRoute = readFileSync("src/app/api/admin/runs/[id]/assign/route.ts", "utf8");

describe("operations expansion migration", () => {
  it("sets the explicit Lagos schedule without activating operations", () => {
    expect(sql).toContain('"sunday":["07:00","22:00"]');
    expect(sql).toContain("same_day_booking_cutoff = '20:30'");
    expect(sql).not.toContain("insert into public.fleet_vehicles");
  });
  it("models distinct runs, stops, assignments and custody events", () => {
    for (const table of ["delivery_runs", "delivery_run_stops", "run_assignments", "parcel_custody_events"]) expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("verified package and vehicle capacity is required for multi-parcel assignment");
  });
  it("keeps expenses, customer charges and settlement separate", () => {
    expect(sql).toContain("create table public.delivery_expense_reports");
    expect(sql).toContain("create table public.customer_surcharges");
    expect(sql).toContain("if selected_intent.surcharge_id is null");
  });
  it("keeps sensitive mutations service-role only", () => {
    expect(sql).toContain("revoke all on function public.accept_assisted_quote");
    expect(sql).toContain("grant execute on function public.assign_order_to_delivery_run");
    expect(sql).toContain("to service_role");
  });
});

describe("operations concurrency migration", () => {
  it("keeps only active run assignments unique", () => {
    expect(concurrencySql).toContain("run_assignments_active_order_idx");
    expect(concurrencySql).toContain("where status in ('assigned','not_collected','collected','onboard','returning')");
  });

  it("protects manual route ordering", () => {
    expect(concurrencySql).toContain("pickup must remain before drop-off");
    expect(concurrencySql).toContain("manual_route_reorder");
    expect(concurrencySql).toContain("grant execute on function public.reorder_delivery_run_stops");
  });
});

describe("delivery run route metrics migration", () => {
  it("persists provider timing and optimized stop order", () => {
    expect(routeMetricsSql).toContain("apply_delivery_run_route_metrics");
    expect(routeMetricsSql).toContain("apply_delivery_run_suggested_stops");
    expect(routeMetricsSql).toContain("estimated_arrival_at");
  });

  it("makes manual route retries idempotent", () => {
    expect(routeMetricsSql).toContain("manualOrderIdempotencyKey");
    expect(routeMetricsSql).toContain("completed_sequence+ordered.position::integer");
  });
});

describe("delivery run capacity and rider-rest hardening", () => {
  it("enforces both rider capacity and maximum continuous riding at the database boundary", () => {
    expect(capacityHardeningSql).toContain("enforce_delivery_assignment_capacity");
    expect(capacityHardeningSql).toContain("rider parcel-count capacity exceeded");
    expect(capacityHardeningSql).toContain("enforce_delivery_run_safety");
    expect(capacityHardeningSql).toContain("delivery run exceeds maximum continuous riding time");
  });

  it("rejects unsafe provider routes before the application creates an assignment", () => {
    expect(runAssignmentRoute).toContain("maximum_continuous_riding_minutes");
    expect(runAssignmentRoute).toContain("minimum_break_minutes");
    expect(runAssignmentRoute).toContain("Split the run before assigning this parcel");
    expect(runAssignmentRoute.indexOf("exceeds the ${restRules.maximum_continuous_riding_minutes}-minute")).toBeLessThan(runAssignmentRoute.indexOf('admin.rpc("assign_order_to_delivery_run"'));
  });
});

