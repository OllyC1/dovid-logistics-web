-- Record delivery proof and its audit event atomically. The application calls
-- this function with a trusted service-role client after authenticating the
-- rider or dispatch administrator.

create or replace function public.record_delivery_proof(
  target_order_id uuid,
  actor_id uuid,
  confirmed_recipient_name text,
  proof_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  selected_order public.delivery_orders%rowtype;
  selected_proof public.delivery_proofs%rowtype;
  actor_is_authorized boolean := false;
begin
  if length(trim(coalesce(confirmed_recipient_name,''))) < 2
    or length(trim(confirmed_recipient_name)) > 120 then
    raise exception 'a valid recipient name is required';
  end if;
  if length(coalesce(proof_notes,'')) > 1000 then
    raise exception 'handover notes are too long';
  end if;

  select * into selected_order
  from public.delivery_orders
  where id=target_order_id
  for update;
  if not found then raise exception 'order not found'; end if;

  select exists(
    select 1
    from public.staff_memberships membership
    join public.profiles profile on profile.id=membership.user_id
    where membership.user_id=actor_id
      and membership.status='active'
      and (
        (membership.staff_role='rider' and profile.role='rider' and selected_order.rider_id=actor_id)
        or (membership.staff_role in ('admin','super_admin') and profile.role='admin')
      )
  ) into actor_is_authorized;
  if not actor_is_authorized then
    raise exception 'assigned rider or admin authorization required';
  end if;

  select * into selected_proof
  from public.delivery_proofs
  where order_id=target_order_id;
  if found then
    return jsonb_build_object(
      'id',selected_proof.id,
      'completed_at',selected_proof.completed_at,
      'recipient_name',selected_proof.recipient_name,
      'already_recorded',true
    );
  end if;

  if selected_order.delivery_status not in ('arrived_at_destination','awaiting_payment') then
    raise exception 'record arrival before confirming the recipient';
  end if;
  if not public.order_has_verified_payment_clearance(target_order_id) then
    raise exception 'verified payment is still outstanding';
  end if;

  insert into public.delivery_proofs(
    order_id,completed_at,recipient_name,notes,payment_clearance_verified,confirmed_by
  ) values (
    target_order_id,now(),trim(confirmed_recipient_name),nullif(trim(coalesce(proof_notes,'')),''),true,actor_id
  ) returning * into selected_proof;

  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(
    actor_id,
    case when selected_order.rider_id=actor_id then 'rider' else 'admin' end,
    'delivery.proof_recorded',
    'delivery_order',
    target_order_id,
    jsonb_build_object('proofId',selected_proof.id,'paymentClearanceVerified',true)
  );

  return jsonb_build_object(
    'id',selected_proof.id,
    'completed_at',selected_proof.completed_at,
    'recipient_name',selected_proof.recipient_name,
    'already_recorded',false
  );
end;
$$;

revoke all on function public.record_delivery_proof(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_delivery_proof(uuid,uuid,text,text) to service_role;
