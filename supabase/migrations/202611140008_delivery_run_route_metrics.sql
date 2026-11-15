-- Persist provider route metrics and suggested stop order without weakening dispatch controls.

create or replace function public.apply_delivery_run_route_metrics() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.route_snapshot is distinct from old.route_snapshot then
    new.route_distance_meters := nullif(new.route_snapshot->>'distanceMeters','')::integer;
    new.route_duration_seconds := nullif(new.route_snapshot->>'durationSeconds','')::integer;
    new.route_provider := nullif(new.route_snapshot->>'provider','');
    new.expected_completion_at := nullif(new.route_snapshot->>'expectedCompletionAt','')::timestamptz;
    new.estimated_profit_kobo := nullif(new.route_snapshot->>'estimatedProfitKobo','')::integer;
  end if;
  return new;
end;
$$;

create trigger delivery_run_route_metrics_trigger
before update of route_snapshot on public.delivery_runs
for each row execute function public.apply_delivery_run_route_metrics();

create or replace function public.apply_delivery_run_suggested_stops() returns trigger
language plpgsql set search_path=public as $$
declare completed_sequence integer;
declare suggested_stop record;
begin
  if new.route_snapshot->'suggestedStops' is not distinct from old.route_snapshot->'suggestedStops' then return new; end if;
  select coalesce(max(sequence),0) into completed_sequence
  from public.delivery_run_stops
  where run_id=new.id and status not in ('pending','next');
  update public.delivery_run_stops set sequence=sequence+10000 where run_id=new.id and status in ('pending','next');
  for suggested_stop in
    select value, ordinality from jsonb_array_elements(coalesce(new.route_snapshot->'suggestedStops','[]'::jsonb)) with ordinality
  loop
    update public.delivery_run_stops
    set sequence=completed_sequence+suggested_stop.ordinality::integer,
        estimated_arrival_at=nullif(suggested_stop.value->>'estimatedArrivalAt','')::timestamptz,
        updated_at=now()
    where run_id=new.id and status in ('pending','next') and (
      id::text=suggested_stop.value->>'id' or
      (order_id::text=suggested_stop.value->>'orderId' and stop_type=suggested_stop.value->>'type')
    );
  end loop;
  return new;
end;
$$;

create trigger delivery_run_suggested_stops_trigger
after update of route_snapshot on public.delivery_runs
for each row execute function public.apply_delivery_run_suggested_stops();

create or replace function public.reorder_delivery_run_stops(
  target_run_id uuid,
  ordered_stop_ids uuid[],
  actor_id uuid,
  change_reason text,
  request_idempotency_key uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare selected_run public.delivery_runs%rowtype;
declare previous_snapshot jsonb;
declare completed_sequence integer;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if length(trim(change_reason))<8 then raise exception 'route adjustment reason required'; end if;
  select * into selected_run from public.delivery_runs where id=target_run_id for update;
  if not found or selected_run.status not in ('planned','active','paused') then raise exception 'delivery run cannot be adjusted'; end if;
  if selected_run.route_snapshot->>'manualOrderIdempotencyKey'=request_idempotency_key::text then return; end if;
  if cardinality(ordered_stop_ids)<>(select count(*) from public.delivery_run_stops where run_id=target_run_id and status in ('pending','next')) then raise exception 'all pending stops must be included exactly once'; end if;
  if (select count(distinct value) from unnest(ordered_stop_ids) value)<>cardinality(ordered_stop_ids) then raise exception 'duplicate stop in route order'; end if;
  if exists(select 1 from unnest(ordered_stop_ids) value where not exists(select 1 from public.delivery_run_stops s where s.id=value and s.run_id=target_run_id and s.status in ('pending','next'))) then raise exception 'route contains an invalid stop'; end if;
  if exists(
    select 1 from public.delivery_run_stops pickup join public.delivery_run_stops dropoff on dropoff.run_id=pickup.run_id and dropoff.order_id=pickup.order_id and dropoff.stop_type='dropoff'
    where pickup.run_id=target_run_id and pickup.stop_type='pickup'
      and array_position(ordered_stop_ids,pickup.id)>array_position(ordered_stop_ids,dropoff.id)
  ) then raise exception 'pickup must remain before drop-off'; end if;
  select jsonb_agg(to_jsonb(s) order by s.sequence) into previous_snapshot from public.delivery_run_stops s where s.run_id=target_run_id;
  select coalesce(max(sequence),0) into completed_sequence from public.delivery_run_stops where run_id=target_run_id and status not in ('pending','next');
  update public.delivery_run_stops set sequence=sequence+10000 where run_id=target_run_id and status in ('pending','next');
  update public.delivery_run_stops s set sequence=completed_sequence+ordered.position::integer,manually_adjusted=true,adjustment_reason=change_reason,updated_at=now()
  from unnest(ordered_stop_ids) with ordinality ordered(id,position) where s.id=ordered.id;
  update public.delivery_runs set version=version+1,updated_at=now(),route_snapshot=route_snapshot||jsonb_build_object('manualOrder',ordered_stop_ids,'manualOrderAdjustedAt',now(),'manualOrderIdempotencyKey',request_idempotency_key) where id=target_run_id;
  insert into public.delivery_run_change_history(run_id,action,previous_snapshot,next_snapshot,changed_by,change_reason)
  select target_run_id,'manual_route_reorder',previous_snapshot,jsonb_agg(to_jsonb(s) order by s.sequence),actor_id,change_reason from public.delivery_run_stops s where s.run_id=target_run_id;
end;
$$;

revoke all on function public.apply_delivery_run_route_metrics() from public,anon,authenticated;
revoke all on function public.apply_delivery_run_suggested_stops() from public,anon,authenticated;
revoke all on function public.reorder_delivery_run_stops(uuid,uuid[],uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reorder_delivery_run_stops(uuid,uuid[],uuid,text,uuid) to service_role;
