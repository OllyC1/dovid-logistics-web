-- Customers may acknowledge only their own in-app notifications.
-- Column-level privileges prevent changing notification content, delivery state,
-- recipient information or provider reconciliation fields through the client API.
revoke update on table public.notifications from anon, authenticated;
grant update(read_at) on table public.notifications to authenticated;

drop policy if exists notifications_own_read_receipt_update on public.notifications;
create policy notifications_own_read_receipt_update
  on public.notifications
  for update
  to authenticated
  using ((select auth.uid()) = customer_id)
  with check ((select auth.uid()) = customer_id);
