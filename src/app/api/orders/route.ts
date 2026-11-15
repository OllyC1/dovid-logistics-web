import { NextResponse, type NextRequest } from "next/server";
import { bookingSchema } from "@/features/orders/validation";
import { publicBookingsEnabled } from "@/lib/launch-controls";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!publicBookingsEnabled()) return NextResponse.json({ error: "Online bookings are not open yet. Please contact Dovid Logistics for help." }, { status: 503 });
  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to confirm this booking." }, { status: 401 });
    const { data, error } = await supabase.rpc("create_delivery_order", { booking_payload: parsed.data });
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Booking could not be created" }, { status: 400 }); }
}
