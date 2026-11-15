-- Supabase installs pgcrypto in the extensions schema. Keep the security
-- definer function's search path explicit while allowing digest() to resolve.
alter function public.create_delivery_order(jsonb)
  set search_path = public, extensions;
