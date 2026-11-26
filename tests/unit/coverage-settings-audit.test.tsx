// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverageEditor, type CoverageZone, type OperationalSettings } from "@/components/admin/coverage-editor";

const zone: CoverageZone = {
  id: "10000000-0000-4000-8000-000000000101",
  name: "Controlled zone",
  code: "TST",
  boundary_geojson: null,
  operational_status: "draft",
  booking_eligibility: "unavailable",
  dispatch_approval_required: true,
  priority: 100,
  effective_from: "2026-11-26T08:00:00.000Z",
  effective_until: null,
  boundary_source: null,
  review_notes: null,
  is_citywide: false,
  affectedOrders: 0,
};

const settings: OperationalSettings = {
  service_area_id: "10000000-0000-4000-8000-000000000001",
  standard_max_distance_meters: 12_000,
  manual_max_distance_meters: 22_000,
  max_active_assignments_per_rider: 10,
  standard_package_sizes: ["small", "medium", "large"],
  oversized_requires_manual_approval: true,
  service_hours: { timezone: "Africa/Lagos", monday: ["08:00", "22:00"], tuesday: ["08:00", "22:00"], wednesday: ["08:00", "22:00"], thursday: ["08:00", "22:00"], friday: ["08:00", "22:00"], saturday: ["08:00", "22:00"], sunday: ["08:00", "22:00"] },
  same_day_booking_cutoff: "20:00:00",
  handover_buffer_minutes: null,
  safe_completion_buffer_minutes: null,
  waiting_free_minutes: 10,
  waiting_fee_per_minute_kobo: 5_000,
  maximum_continuous_riding_minutes: 180,
  minimum_break_minutes: 20,
  motorcycle_restrictions_confirmed_at: null,
  motorcycle_restrictions_notes: null,
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ saved: true }), { status: 200, headers: { "Content-Type": "application/json" } }))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CoverageEditor operating rules", () => {
  it("requires a reason and sends it with the complete settings update", async () => {
    render(<CoverageEditor initialZones={[zone]} settings={settings} />);

    expect(screen.getByText("Automatic scheduling is not ready")).toBeTruthy();
    expect(screen.getAllByText("Not set")).toHaveLength(2);
    expect(screen.getByText(/bookings will stay in dispatch review/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Pickup handover allowance (minutes)"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("End-of-day safety allowance (minutes)"), { target: { value: "20" } });
    expect(screen.getByText("Safety times are configured")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save operating rules" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/previous and new values will be saved together/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Operational reason"), { target: { value: "Founder approved safe launch buffers" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save operating rules" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body)) as Record<string, unknown>;
    expect(body).toMatchObject({ handoverBufferMinutes: 15, safeCompletionBufferMinutes: 20, reason: "Founder approved safe launch buffers" });
    expect((await screen.findByRole("status")).textContent).toContain("Operational thresholds saved.");
  });
});
