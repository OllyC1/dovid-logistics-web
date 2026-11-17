-- Mobile-first admin workflow completion. All new fields are nullable for existing records.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists preferred_name text;

alter table public.profiles drop constraint if exists profiles_first_name_length;
alter table public.profiles add constraint profiles_first_name_length check (first_name is null or char_length(trim(first_name)) between 2 and 60) not valid;
alter table public.profiles drop constraint if exists profiles_last_name_length;
alter table public.profiles add constraint profiles_last_name_length check (last_name is null or char_length(trim(last_name)) between 2 and 60) not valid;
alter table public.profiles drop constraint if exists profiles_preferred_name_length;
alter table public.profiles add constraint profiles_preferred_name_length check (preferred_name is null or char_length(trim(preferred_name)) between 2 and 60) not valid;

alter table public.assisted_booking_drafts
  add column if not exists customer_email text;
alter table public.assisted_booking_drafts drop constraint if exists assisted_booking_drafts_customer_email_format;
alter table public.assisted_booking_drafts add constraint assisted_booking_drafts_customer_email_format
  check (customer_email is null or customer_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;

alter table public.promotions drop constraint if exists promotions_kind_check;
alter table public.promotions add constraint promotions_kind_check
  check (kind in ('fixed','percentage','fixed_price'));

comment on column public.profiles.preferred_name is 'Optional name staff prefer to be addressed by; never used for authorization.';
comment on column public.assisted_booking_drafts.customer_email is 'Optional notification address supplied during assisted booking; phone remains required.';
comment on column public.promotions.value is 'Kobo for fixed discount/fixed customer price; basis points for percentage.';

create or replace function public.update_staff_profile_record(
  target_user_id uuid,
  action_actor_id uuid,
  target_first_name text,
  target_last_name text,
  target_preferred_name text,
  target_full_name text,
  target_phone text,
  change_reason text
) returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare selected_role public.staff_role;
begin
  select staff_role into selected_role from public.staff_memberships where user_id = target_user_id for update;
  if selected_role is null then raise exception 'Staff membership not found'; end if;
  if selected_role = 'rider' and nullif(trim(target_phone), '') is null then raise exception 'A reachable mobile number is required for riders'; end if;
  update public.profiles set first_name=trim(target_first_name),last_name=trim(target_last_name),preferred_name=nullif(trim(target_preferred_name),''),full_name=trim(target_full_name),phone=nullif(trim(target_phone),''),updated_at=now() where id=target_user_id;
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(action_actor_id,'admin','staff.profile.updated','profile',target_user_id,jsonb_build_object('reason',change_reason,'firstNameRecorded',true,'lastNameRecorded',true,'preferredNameRecorded',nullif(trim(target_preferred_name),'') is not null,'phoneRecorded',nullif(trim(target_phone),'') is not null));
end $$;

create or replace function public.delete_unused_rate_card_draft(target_rate_card_id uuid, action_actor_id uuid, deletion_reason text)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare selected_card public.rate_cards%rowtype;
begin
  select * into selected_card from public.rate_cards where id=target_rate_card_id for update;
  if selected_card.id is null then raise exception 'Rate card not found'; end if;
  if selected_card.active then raise exception 'An active rate card cannot be deleted'; end if;
  if exists(select 1 from public.quotes where rate_card_id=target_rate_card_id) then raise exception 'This rate card has quote history and must remain immutable'; end if;
  delete from public.rate_card_bands where rate_card_id=target_rate_card_id;
  delete from public.rate_cards where id=target_rate_card_id;
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(action_actor_id,'admin','rate_card.draft_deleted','rate_card',target_rate_card_id,jsonb_build_object('name',selected_card.name,'reason',deletion_reason));
end $$;

create or replace function public.set_promotion_active(target_promotion_id uuid, action_actor_id uuid, next_active boolean, change_reason text)
returns table(id uuid,code text,active boolean) language plpgsql security definer set search_path = public, pg_catalog as $$
declare selected_promotion public.promotions%rowtype;
begin
  select * into selected_promotion from public.promotions where promotions.id=target_promotion_id for update;
  if selected_promotion.id is null then raise exception 'Promotion not found'; end if;
  update public.promotions set active=next_active where promotions.id=target_promotion_id;
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(action_actor_id,'admin',case when next_active then 'promotion.activated' else 'promotion.deactivated' end,'promotion',target_promotion_id,jsonb_build_object('code',selected_promotion.code,'reason',change_reason));
  return query select selected_promotion.id,selected_promotion.code,next_active;
end $$;

revoke all on function public.update_staff_profile_record(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.delete_unused_rate_card_draft(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.set_promotion_active(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.update_staff_profile_record(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.delete_unused_rate_card_draft(uuid,uuid,text) to service_role;
grant execute on function public.set_promotion_active(uuid,uuid,boolean,text) to service_role;
