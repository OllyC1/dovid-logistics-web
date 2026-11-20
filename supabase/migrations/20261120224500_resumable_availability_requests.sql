alter table public.delivery_availability_requests
  add column if not exists reference_code text;

create or replace function public.assign_availability_request_reference()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if nullif(trim(new.reference_code),'') is null then
    new.reference_code := 'DOV-APR-' || to_char(coalesce(new.created_at,now()),'YYMMDD') || '-' ||
      upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  return new;
end;
$$;

drop trigger if exists assign_availability_request_reference on public.delivery_availability_requests;
create trigger assign_availability_request_reference
before insert or update of reference_code on public.delivery_availability_requests
for each row execute function public.assign_availability_request_reference();

update public.delivery_availability_requests
set reference_code='DOV-APR-' || to_char(created_at,'YYMMDD') || '-' ||
  upper(substr(replace(id::text,'-',''),1,8))
where reference_code is null or reference_code='';

alter table public.delivery_availability_requests
  alter column reference_code set not null;

create unique index if not exists delivery_availability_requests_reference_code_idx
  on public.delivery_availability_requests(reference_code);

revoke all on function public.assign_availability_request_reference() from public,anon,authenticated;
grant execute on function public.assign_availability_request_reference() to service_role;

create or replace function public.notify_dispatch_of_availability_request()
returns trigger language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare recipient record;
begin
  if new.status <> 'pending' then return new; end if;
  for recipient in
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
  loop
    insert into public.notifications(
      customer_id,channel,event_type,title,subject,body,recipient_email,deduplication_key,
      status,delivery_status,priority,metadata,next_attempt_at
    ) values (
      recipient.user_id,
      'email',
      'dispatch.approval_requested',
      'Route approval requested: ' || new.reference_code,
      'Route approval requested: ' || new.reference_code,
      'A delivery route needs review from ' || coalesce(new.request_payload->>'pickupAddress','pickup') ||
        ' to ' || coalesce(new.request_payload->>'deliveryAddress','destination') ||
        '. Reference ' || new.reference_code || '. Open Dispatch Control to approve or reject it.',
      recipient.email,
      'availability-request:' || new.id::text || ':' || recipient.user_id::text,
      'queued',
      'queued',
      90,
      jsonb_build_object(
        'actionPath','/admin/dispatch',
        'referenceCode',new.reference_code,
        'availabilityRequestId',new.id,
        'reasonCode',new.reason_code
      ),
      now()
    )
    on conflict (deduplication_key) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_dispatch_availability_request on public.delivery_availability_requests;
create trigger notify_dispatch_availability_request
after insert on public.delivery_availability_requests
for each row execute function public.notify_dispatch_of_availability_request();

revoke all on function public.notify_dispatch_of_availability_request() from public,anon,authenticated;
grant execute on function public.notify_dispatch_of_availability_request() to service_role;
