import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261125221900_booking_continuation_capacity_waiting_enquiries.sql", "utf8");
const purposeMigration = readFileSync("supabase/migrations/20261126013929_purpose_locked_email_presentations.sql", "utf8");
const quoteRoute = readFileSync("src/app/api/delivery/quotes/route.ts", "utf8");
const dispatchReadiness = readFileSync("src/features/dispatch/readiness.ts", "utf8");
const approvalRoute = readFileSync("src/app/api/admin/dispatch/requests/[id]/route.ts", "utf8");
const booking = readFileSync("src/components/booking/booking-wizard.tsx", "utf8");
const contact = readFileSync("src/app/contact/page.tsx", "utf8");
const footer = readFileSync("src/components/layout/footer.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const seo = readFileSync("src/lib/seo.ts", "utf8");

describe("booking continuation, contact and discoverability contracts", () => {
  it("keeps manual approval separate from order creation and uses a secure continuation token", () => {
    expect(approvalRoute).toContain("availability_request_access_tokens");
    expect(approvalRoute).toContain("Your order has not been created and no rider has been assigned yet");
    expect(quoteRoute).toContain("APPROVAL_TOKEN_REQUIRED");
    expect(quoteRoute).toContain("approvalScope");
    expect(booking).toContain("continue automatically after approval");
  });

  it("counts remaining verified rider and motorcycle capacity instead of treating one assignment as full", () => {
    expect(migration).toContain("vehicle_workload>=effective_capacity");
    expect(migration).toContain("rider_workload>=coalesce(rider_capacity,1)");
    expect(migration).toContain("greatest(coalesce(load.workload,0),coalesce(rider_load.workload,0))");
    expect(quoteRoute).toContain("calculateDispatchCapacity");
    expect(dispatchReadiness).toContain("remainingDispatchSlots");
    expect(dispatchReadiness).toContain("capacity_verified_at");
  });

  it("applies route-duration and safety-buffer scheduling to public booking", () => {
    expect(quoteRoute).toContain("evaluateOperatingSchedule");
    expect(quoteRoute).toContain("handover_buffer_minutes");
    expect(quoteRoute).toContain("safe_completion_buffer_minutes");
    expect(quoteRoute).toContain("maximum_continuous_riding_minutes");
    expect(quoteRoute).toContain("minimum_break_minutes");
    expect(quoteRoute).toContain('schedule.decision !== "same_day_eligible"');
    expect(quoteRoute).toContain("scheduleReason: schedule.reason");
  });

  it("starts waiting on arrival and keeps the resulting fee review-only", () => {
    expect(migration).toContain("new.delivery_status='arrived_at_destination'");
    expect(migration).toContain("selected_waiting.free_waiting_minutes_snapshot*60");
    expect(migration).toContain("already_incurred,customer_approval_obtained");
    expect(migration).toContain("false,false,selected_waiting.id");
  });

  it("queues deduplicated internal and acknowledgement emails for website enquiries", () => {
    expect(migration).toContain("queue_website_enquiry_email");
    expect(migration).toContain("email:website-enquiry:internal:");
    expect(migration).toContain("email:website-enquiry:ack:");
    expect(migration).toContain("on conflict(deduplication_key) do nothing");
    expect(purposeMigration).toContain("'enquirySubject', new.subject");
    expect(purposeMigration).not.toContain("'actionPath', '/contact'");
  });

  it("publishes the official phone, WhatsApp and customer-support structured data", () => {
    expect(contact).toContain("siteConfig.support.phone");
    expect(contact).toContain("siteConfig.support.whatsapp");
    expect(footer).toContain("siteConfig.support.phone");
    expect(layout).toContain('"LocalBusiness"');
    expect(layout).toContain("contactPoint");
    expect(seo).toContain("title: { absolute: brandedTitle }");
  });
});
