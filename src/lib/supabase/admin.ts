import { createClient } from "@supabase/supabase-js";
import { publicEnv, requireServerEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}
