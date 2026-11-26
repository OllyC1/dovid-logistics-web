begin;

\ir fixtures/operational-base.sql

do $$
declare function_definition text;
declare enquiry_definition text;
declare dispatch_definition text;
declare payment_definition text;
begin
  function_definition := pg_get_functiondef('private.queue_order_email(uuid,text,text,text,text,integer,jsonb)'::regprocedure);
  enquiry_definition := pg_get_functiondef('private.queue_website_enquiry_email()'::regprocedure);
  dispatch_definition := pg_get_functiondef('public.notify_dispatch_of_availability_request()'::regprocedure);
  payment_definition := pg_get_functiondef('private.queue_payment_confirmation_email()'::regprocedure);

  if position('Track it here:' in function_definition) > 0 then
    raise exception 'order email body still embeds a generic raw tracking path';
  end if;
  if position('jsonb_build_object(''actionPath'', action_path)' in function_definition) = 0 then
    raise exception 'order email metadata does not use the resolved customer or guest action path';
  end if;
  if function_definition !~ '\)\s*\|\|\s*notification_metadata\s*\|\|\s*jsonb_build_object\(''actionPath'',\s*action_path\)' then
    if function_definition !~ '\)\s*\|\|\s*safe_metadata\s*\|\|\s*jsonb_build_object\(''actionPath'',\s*action_path\)' then
      raise exception 'event-specific email metadata does not override base order metadata';
    end if;
  end if;
  if position('notification_metadata - ''recipientEmail''' in function_definition) = 0 then
    raise exception 'private receipt recipient override leaks into rendered email metadata';
  end if;
  if position('''recipientEmail'', new.receipt_email' in payment_definition) = 0 then
    raise exception 'payment confirmation is not routed to the payment intent receipt address';
  end if;
  if has_function_privilege('anon', 'private.queue_order_email(uuid,text,text,text,text,integer,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'private.queue_order_email(uuid,text,text,text,text,integer,jsonb)', 'execute') then
    raise exception 'private order email queue function is exposed to application roles';
  end if;
  if position('''enquirySubject'', new.subject' in enquiry_definition) = 0 then
    raise exception 'website enquiry emails do not preserve purpose-specific topic metadata';
  end if;
  if position('''enquiryName'', new.name' in enquiry_definition) = 0
     or position('''enquiryEmail'', lower(new.email)' in enquiry_definition) = 0
     or position('''enquiryMessage'', new.message' in enquiry_definition) = 0 then
    raise exception 'internal website enquiry email lacks structured contact metadata';
  end if;
  if position('''actionPath''' in enquiry_definition) > 0 then
    raise exception 'website enquiry emails still contain an unrelated application action';
  end if;
  if position('pickupAddress' in dispatch_definition) = 0
     or position('deliveryAddress' in dispatch_definition) = 0 then
    raise exception 'dispatch approval email does not preserve route metadata';
  end if;
end;
$$;

update public.delivery_orders
set notification_email = 'delivery-updates@example.com',
    receipt_email = 'previous-receipt@example.com'
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

insert into public.payment_intents(
  id, order_id, provider, provider_reference, amount_minor, currency, status,
  expires_at, receipt_email
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'paystack', 'DOV-EMAIL-RECIPIENT-VALIDATION', 200000, 'NGN', 'processing',
  now() + interval '30 minutes', 'payer-receipt@example.com'
);

update public.payment_intents
set status = 'paid', updated_at = now()
where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

select private.queue_order_email(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'package_collected',
  'Package collected',
  'The package is on the way.',
  'email:recipient-validation:delivery',
  50,
  '{}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from public.notifications
    where deduplication_key = 'email:payment-confirmed:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      and recipient_email = 'payer-receipt@example.com'
      and not (metadata ? 'recipientEmail')
  ) then
    raise exception 'payment receipt did not use the payer email without leaking its private routing override';
  end if;

  if not exists (
    select 1 from public.notifications
    where deduplication_key = 'email:recipient-validation:delivery'
      and recipient_email = 'delivery-updates@example.com'
  ) then
    raise exception 'delivery progress email did not use the order notification contact';
  end if;
end;
$$;

rollback;

select 'purpose-specific email database validation passed' as result;
