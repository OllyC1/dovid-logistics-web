-- Keep website enquiries structurally separate from delivery notifications.
-- The application renderer owns all visible copy for an approved event type;
-- this trigger supplies typed enquiry fields and never assigns a customer CTA.

create or replace function private.queue_website_enquiry_email() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
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
    'A new website enquiry is ready for review.',
    'hello@dovidlogistics.com', 'email:website-enquiry:internal:' || new.id,
    'queued', 'queued', 95,
    jsonb_strip_nulls(jsonb_build_object(
      'enquiryId', new.id,
      'enquiryKind', enquiry_kind,
      'enquiryName', new.name,
      'enquiryEmail', lower(new.email),
      'enquiryPhone', new.phone,
      'enquiryCompany', new.company_name,
      'enquirySubject', new.subject,
      'enquiryMessage', new.message
    )),
    now()
  ) on conflict(deduplication_key) do nothing;

  insert into public.notifications(
    customer_id, order_id, channel, event_type, title, subject, body, recipient_email,
    deduplication_key, status, delivery_status, priority, metadata, next_attempt_at
  ) values (
    null, null, 'email', 'website_enquiry_acknowledged', 'We received your enquiry',
    'We received your Dovid Logistics ' || enquiry_kind || ' enquiry',
    'Your website enquiry was received.',
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
