with pending_summary as (
  select count(*) as request_count, min(reference_code) as first_reference
  from public.delivery_availability_requests
  where status='pending'
), recipients as (
  select membership.user_id, auth_user.email
  from public.staff_memberships membership
  join auth.users auth_user on auth_user.id=membership.user_id
  where membership.status='active'
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until<=now())
    and (
      membership.staff_role='super_admin'
      or (
        membership.staff_role='admin'
        and exists(
          select 1 from public.staff_permission_grants grant_row
          where grant_row.user_id=membership.user_id
            and grant_row.permission_key='dispatch.manage'
        )
      )
    )
)
insert into public.notifications(
  customer_id,channel,event_type,title,subject,body,recipient_email,deduplication_key,
  status,delivery_status,priority,metadata,next_attempt_at
)
select
  recipients.user_id,
  'email',
  'dispatch.approval_queue',
  'Dispatch approvals are waiting',
  'Dispatch approvals are waiting',
  pending_summary.request_count::text || ' delivery route approval request(s) are waiting. ' ||
    'Open Dispatch Control to approve or reject them. First reference: ' || pending_summary.first_reference || '.',
  recipients.email,
  'availability-pending-summary:' || recipients.user_id::text || ':' || to_char(current_date,'YYYYMMDD'),
  'queued',
  'queued',
  95,
  jsonb_build_object(
    'actionPath','/admin/dispatch',
    'pendingCount',pending_summary.request_count,
    'firstReference',pending_summary.first_reference
  ),
  now()
from recipients,pending_summary
where pending_summary.request_count>0
  and recipients.email is not null
on conflict (deduplication_key) do nothing;
