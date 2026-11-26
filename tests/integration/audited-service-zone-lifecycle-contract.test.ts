import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261126011311_audited_service_zone_lifecycle.sql", "utf8");
const collectionRoute = readFileSync("src/app/api/admin/coverage/zones/route.ts", "utf8");
const itemRoute = readFileSync("src/app/api/admin/coverage/zones/[id]/route.ts", "utf8");
const actionRoute = readFileSync("src/app/api/admin/coverage/zones/[id]/action/route.ts", "utf8");
const editor = readFileSync("src/components/admin/coverage-editor.tsx", "utf8");

describe("audited service-zone lifecycle", () => {
  it("creates only inactive, geometry-free drafts through a permission-checked RPC", () => {
    expect(migration).toContain("private.has_staff_permission_for(actor_id,'zones.manage')");
    expect(migration).toContain("target_service_area_id,trim(zone_name),normalized_code,null,false,'draft'");
    expect(migration).toContain("'boundaryProvided',false");
    expect(collectionRoute).toContain('auth.admin.rpc("create_service_zone_draft"');
    expect(collectionRoute).not.toContain("boundaryGeoJson");
  });

  it("forces material live-zone edits back through review and preserves actor and reason", () => {
    expect(migration).toContain("new.booking_eligibility");
    expect(migration).toContain("new.dispatch_approval_required");
    expect(migration).toContain("new.priority");
    expect(migration).toContain("new.operational_status := 'draft'");
    expect(migration).toContain("current_setting('app.change_reason',true)");
    expect(itemRoute).toContain('admin.rpc("save_service_zone_draft"');
    expect(itemRoute).toContain("change_reason: parsed.data.reason");
  });

  it("keeps every mutation service-role only and uses the audited action wrapper", () => {
    expect(migration).toContain("revoke all on function public.create_service_zone_draft");
    expect(migration).toContain("revoke all on function public.save_service_zone_draft");
    expect(migration).toContain("revoke all on function public.manage_service_zone_action");
    expect(migration).toContain("to service_role");
    expect(actionRoute).toContain('admin.rpc("manage_service_zone_action"');
  });

  it("presents mobile-first progressive disclosure and requires reasons", () => {
    expect(editor).toContain("Add a service zone");
    expect(editor).toContain("Create inactive draft");
    expect(editor).toContain("Why is this zone needed?");
    expect(editor).toContain('setZoneAction("save")');
    expect(editor).toContain("Any material change to a live zone immediately returns it to Draft");
  });
});
