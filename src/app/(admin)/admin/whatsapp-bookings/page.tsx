import { AssistedBookingConsole } from "@/components/admin/assisted-booking-console";
import { requireStaffPermission } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function WhatsAppBookingsPage() {
  await requireStaffPermission("bookings.manage");
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("assisted_booking_drafts").select("id,customer_name,customer_phone,status,booking_origin,created_at").order("created_at", { ascending: false }).limit(50);
  return <><p className="eyebrow">Assisted bookings</p><h1 className="mt-2 text-3xl font-extrabold text-navy">WhatsApp booking queue</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate">Create a draft, check the real route and approved pricing, then give the customer a short-lived review link. A WhatsApp message never authorizes a charge.</p><div className="mt-8"><AssistedBookingConsole drafts={data ?? []} /></div></>;
}

