-- Make server-only pricing activation usable without losing the authenticated
-- administrator identity, permission check or approval reason.

create or replace function public.activate_pricing_configuration_version(
  target_version_id uuid,
  reason text,
  actor_id uuid
) returns void
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  target public.pricing_configuration_versions%rowtype;
begin
  if length(trim(coalesce(reason,''))) < 8 then
    raise exception 'activation reason required';
  end if;
  if not exists(
    select 1
    from public.profiles profile
    join public.staff_memberships membership on membership.user_id=profile.id
    where profile.id=actor_id
      and profile.role='admin'
      and membership.status='active'
      and membership.staff_role in ('admin','super_admin')
      and (
        membership.staff_role='super_admin'
        or exists(
          select 1 from public.staff_permission_grants permission
          where permission.user_id=actor_id and permission.permission_key='pricing.manage'
        )
      )
  ) then
    raise exception 'pricing manager authorization required';
  end if;

  select * into target
  from public.pricing_configuration_versions
  where id=target_version_id
  for update;
  if not found then raise exception 'pricing version not found'; end if;

  update public.pricing_configuration_versions
  set status='retired', retired_at=now(), updated_by=actor_id, updated_at=now()
  where pricing_configuration_id=target.pricing_configuration_id
    and status='active'
    and id<>target.id;

  update public.pricing_configuration_versions
  set status='active', effective_at=greatest(effective_at,now()), retired_at=null,
      updated_by=actor_id, updated_at=now(), change_reason=trim(reason)
  where id=target_version_id;

  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(actor_id,'admin','pricing.version.activated','pricing_configuration_version',target_version_id,
    jsonb_build_object('reason',trim(reason),'configurationId',target.pricing_configuration_id,'version',target.version));
end;
$$;

create or replace function public.activate_rate_card(
  target_rate_card_id uuid,
  actor_id uuid,
  reason text
) returns void
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  target public.rate_cards%rowtype;
begin
  if length(trim(coalesce(reason,''))) < 8 then
    raise exception 'activation reason required';
  end if;
  if not exists(
    select 1
    from public.profiles profile
    join public.staff_memberships membership on membership.user_id=profile.id
    where profile.id=actor_id
      and profile.role='admin'
      and membership.status='active'
      and membership.staff_role in ('admin','super_admin')
      and (
        membership.staff_role='super_admin'
        or exists(
          select 1 from public.staff_permission_grants permission
          where permission.user_id=actor_id and permission.permission_key='pricing.manage'
        )
      )
  ) then
    raise exception 'pricing manager authorization required';
  end if;

  select * into target from public.rate_cards where id=target_rate_card_id for update;
  if not found then raise exception 'rate card not found'; end if;
  if not exists(
    select 1 from public.pricing_configuration_versions version
    where version.id=target.configuration_version_id and version.status='active'
  ) then
    raise exception 'activate the linked pricing configuration before this rate card';
  end if;
  if not exists(select 1 from public.rate_card_bands band where band.rate_card_id=target.id) then
    raise exception 'rate card requires at least one distance band';
  end if;

  update public.rate_cards set active=false
  where id<>target.id and active=true and service_level=target.service_level
    and ((service_area_id=target.service_area_id) or (service_area_id is null and target.service_area_id is null));
  update public.rate_cards set active=true where id=target.id;

  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(actor_id,'admin','pricing.rate_card.activated','rate_card',target.id,
    jsonb_build_object('reason',trim(reason),'serviceLevel',target.service_level,'serviceAreaId',target.service_area_id,'configurationVersionId',target.configuration_version_id));
end;
$$;

revoke all on function public.activate_pricing_configuration_version(uuid,text) from service_role;
revoke all on function public.activate_rate_card(uuid) from service_role;
revoke all on function public.activate_pricing_configuration_version(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.activate_rate_card(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.activate_pricing_configuration_version(uuid,text,uuid) to service_role;
grant execute on function public.activate_rate_card(uuid,uuid,text) to service_role;
