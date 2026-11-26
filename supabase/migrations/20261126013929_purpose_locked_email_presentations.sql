-- Give every application email enough typed metadata for its approved,
-- purpose-specific presentation. The application renderer ignores arbitrary
-- queued subjects and headings; event_type is the authoritative template key.

create or replace function private.queue_website_enquiry_email() returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  enquiry_kind text;
  support_subject text;
begin
  enquiry_kind := case when tg_table_name = 'business_enquiries' then 'business' else 'support' end;
  support_subject := case when enquiry_kind = 'business' then 'New business enquiry' else 'New website support enquiry' end;

  insert into public.notifications(
    customer_id, order_id, channel, event_type, title, subject, body, recipient_email,
    deduplication_key, status, delivery_status, priority, metadata, next_attempt_at
  ) values (
    null, null, 'email', 'website_enquiry_received', support_subject,
    support_subject || ': ' || left(new.subject, 120),
    'Name: ' || new.name || E'\nEmail: ' || new.email || E'\nPhone: ' || coalesce(new.phone, 'Not provided') ||
      case when new.company_name is null then '' else E'\nBusiness: ' || new.company_name end ||
      E'\nSubject: ' || new.subject || E'\n\nMessage:\n' || new.message,
    'hello@dovidlogistics.com', 'email:website-enquiry:internal:' || new.id,
    'queued', 'queued', 95,
    jsonb_build_object(
      'actionPath', '/admin',
      'enquiryId', new.id,
      'enquiryKind', enquiry_kind,
      'enquirySubject', new.subject
    ),
    now()
  ) on conflict(deduplication_key) do nothing;

  insert into public.notifications(
    customer_id, order_id, channel, event_type, title, subject, body, recipient_email,
    deduplication_key, status, delivery_status, priority, metadata, next_attempt_at
  ) values (
    null, null, 'email', 'website_enquiry_acknowledged', 'We received your message',
    'We received your Dovid Logistics enquiry',
    'Thank you for contacting Dovid Logistics. Our team has received your message about "' || left(new.subject, 120) || '" and will reply using the contact details you provided.',
    lower(new.email), 'email:website-enquiry:ack:' || new.id,
    'queued', 'queued', 60,
    jsonb_build_object(
      'enquiryId', new.id,
      'enquiryKind', enquiry_kind,
      'enquirySubject', new.subject
    ),
    now()
  ) on conflict(deduplication_key) do nothing;

  return new;
end;
$$;

revoke all on function private.queue_website_enquiry_email() from public, anon, authenticated;

create or replace function public.notify_dispatch_of_availability_request()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare recipient record;
begin
  if new.status <> 'pending' then return new; end if;

  for recipient in
    select membership.user_id, auth_user.email
    from public.staff_memberships membership
    join auth.users auth_user on auth_user.id = membership.user_id
    where membership.status = 'active'
      and auth_user.deleted_at is null
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
      and (
        membership.staff_role = 'super_admin'
        or (
          membership.staff_role = 'admin'
          and exists(
            select 1
            from public.staff_permission_grants grant_row
            where grant_row.user_id = membership.user_id
              and grant_row.permission_key = 'dispatch.manage'
          )
        )
      )
  loop
    insert into public.notifications(
      customer_id, channel, event_type, title, subject, body, recipient_email,
      deduplication_key, status, delivery_status, priority, metadata, next_attempt_at
    ) values (
      recipient.user_id, 'email', 'dispatch.approval_requested',
      'Route approval requested: ' || new.reference_code,
      'Route approval requested: ' || new.reference_code,
      'A delivery route needs review from ' || coalesce(new.request_payload->>'pickupAddress', 'pickup') ||
        ' to ' || coalesce(new.request_payload->>'deliveryAddress', 'destination') ||
        '. Reference ' || new.reference_code || '. Open Dispatch Control to approve or reject it.',
      recipient.email,
      'availability-request:' || new.id::text || ':' || recipient.user_id::text,
      'queued', 'queued', 90,
      jsonb_build_object(
        'actionPath', '/admin/dispatch',
        'referenceCode', new.reference_code,
        'availabilityRequestId', new.id,
        'reasonCode', new.reason_code,
        'pickupAddress', new.request_payload->>'pickupAddress',
        'deliveryAddress', new.request_payload->>'deliveryAddress'
      ),
      now()
    ) on conflict(deduplication_key) do nothing;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_dispatch_of_availability_request() from public, anon, authenticated;
grant execute on function public.notify_dispatch_of_availability_request() to service_role;
