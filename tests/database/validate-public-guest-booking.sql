\set ON_ERROR_STOP on

set role service_role;

insert into public.quotes(
  id,request_payload,distance_meters,amount_minor,currency,expires_at,status,
  service_level,payment_method,operational_approval_status
) values (
  '18181818-1818-4818-8818-181818181818',
  '{"pickupAddress":"Bodija Market, Ibadan","pickupCoordinates":{"latitude":7.435,"longitude":3.91},"deliveryAddress":"Ring Road, Ibadan","deliveryCoordinates":{"latitude":7.36,"longitude":3.875},"packageSize":"small","packageCategory":"parcel","additionalStops":[],"oversized":false,"payer":"sender","paymentMethod":"online","serviceLevel":"standard"}',
  5200,230000,'NGN',now()+interval '1 hour','created','standard','online','not_required'
);

insert into public.guest_quote_access_tokens(quote_id,token_hash,expires_at)
values(
  '18181818-1818-4818-8818-181818181818',
  repeat('a',64),
  now()+interval '1 hour'
);

do $$
declare
  payload jsonb := '{"quoteId":"18181818-1818-4818-8818-181818181818","guestQuoteToken":"browser-only-value","idempotencyKey":"19191919-1919-4919-8919-191919191919","pickupAddress":"Bodija Market, Ibadan","pickupCoordinates":{"latitude":7.435,"longitude":3.91},"deliveryAddress":"Ring Road, Ibadan","deliveryCoordinates":{"latitude":7.36,"longitude":3.875},"packageSize":"small","packageCategory":"parcel","packageDescription":"","additionalStops":[],"oversized":false,"senderName":"Guest Sender","senderPhone":"08000000000","recipientName":"Guest Receiver","recipientPhone":"08000000001","payer":"sender","paymentMethod":"online","serviceLevel":"standard"}';
  created jsonb;
  replayed jsonb;
begin
  if has_function_privilege('authenticated','public.create_guest_delivery_order(jsonb,text,text,timestamptz)','execute') then
    raise exception 'authenticated role can execute guest order creation directly';
  end if;
  if has_table_privilege('anon','public.guest_quote_access_tokens','select')
    or has_table_privilege('authenticated','public.guest_quote_access_tokens','select') then
    raise exception 'browser database roles can read guest quote tokens';
  end if;

  begin
    perform public.create_guest_delivery_order(
      jsonb_set(payload,'{deliveryCoordinates,latitude}','7.5'::jsonb),
      repeat('a',64),repeat('b',64),now()+interval '30 days'
    );
    raise exception 'tampered guest route was accepted';
  exception when others then
    if sqlerrm <> 'booking does not match confirmed quote' then raise; end if;
  end;

  created := public.create_guest_delivery_order(
    payload,repeat('a',64),repeat('b',64),now()+interval '30 days'
  );
  replayed := public.create_guest_delivery_order(
    payload,repeat('a',64),repeat('c',64),now()+interval '30 days'
  );

  if created->>'order_id' is distinct from replayed->>'order_id' then
    raise exception 'guest booking idempotency failed';
  end if;
  if (select count(*) from public.delivery_orders where quote_id='18181818-1818-4818-8818-181818181818') <> 1 then
    raise exception 'guest quote created more than one order';
  end if;
  if not (select guest_booking and customer_id is null and booking_origin='website'
          from public.delivery_orders where id=(created->>'order_id')::uuid) then
    raise exception 'guest order ownership metadata is incorrect';
  end if;
  if (select token_hash from public.guest_order_access_tokens where order_id=(created->>'order_id')::uuid) <> repeat('c',64) then
    raise exception 'guest access token was not rotated on idempotent replay';
  end if;
  if not exists(select 1 from public.audit_logs where action='guest_order.created' and resource_id=(created->>'order_id')::uuid) then
    raise exception 'guest order audit record is missing';
  end if;
end $$;

reset role;

