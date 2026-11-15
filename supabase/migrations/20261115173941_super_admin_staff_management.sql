-- Secure staff management and one-time founder bootstrap.
-- Application roles remain backward compatible: Super Admins retain profiles.role = 'admin'
-- while their elevated role and permissions live in the staff tables below.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$ begin
  create type public.staff_role as enum ('super_admin', 'admin', 'rider');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_status as enum ('pending', 'active', 'suspended', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_invitation_status as enum ('pending', 'sent', 'accepted', 'expired', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bootstrap_status as enum ('approved', 'invited', 'completed', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

create table public.staff_permissions (
  permission_key text primary key,
  description text not null,
  created_at timestamptz not null default now(),
  check (permission_key ~ '^[a-z]+([._][a-z]+)*$')
);

insert into public.staff_permissions(permission_key, description) values
  ('staff.view', 'View staff, invitations and staff audit history'),
  ('riders.invite', 'Invite riders for identity and operations review'),
  ('riders.manage', 'Verify, activate, suspend and manage riders'),
  ('dispatch.manage', 'Manage dispatch requests, assignments and runs'),
  ('bookings.manage', 'Manage customer and assisted bookings'),
  ('pricing.view', 'View internal pricing and profitability data'),
  ('pricing.manage', 'Manage approved pricing configuration'),
  ('payments.view', 'View payment and settlement records'),
  ('payments.reconcile', 'Reconcile payment records'),
  ('reports.view', 'View operational and financial reports'),
  ('zones.manage', 'Manage service-zone drafts and approvals'),
  ('admins.invite', 'Invite administrators; reserved to Super Admins'),
  ('admins.manage_permissions', 'Manage administrator permissions; reserved to Super Admins'),
  ('staff.suspend', 'Suspend or reactivate authorized staff')
on conflict (permission_key) do update set description=excluded.description;

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  intended_role public.staff_role not null,
  status public.staff_invitation_status not null default 'pending',
  requested_permissions text[] not null default '{}',
  auth_user_id uuid references auth.users(id) on delete restrict,
  invited_by uuid references public.profiles(id) on delete restrict,
  is_bootstrap boolean not null default false,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email=lower(trim(email))),
  check (expires_at>created_at),
  check ((is_bootstrap and intended_role='super_admin') or (not is_bootstrap and intended_role<>'super_admin'))
);

create unique index staff_invitations_open_email_idx
on public.staff_invitations(email)
where status in ('pending','sent','accepted');

create table public.staff_memberships (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  staff_role public.staff_role not null,
  status public.staff_status not null default 'pending',
  invitation_id uuid unique references public.staff_invitations(id) on delete restrict,
  identity_verified_at timestamptz,
  identity_verified_by uuid references public.profiles(id) on delete restrict,
  identity_verification_method text,
  identity_verification_reference text,
  suspended_at timestamptz,
  suspended_by uuid references public.profiles(id) on delete restrict,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((identity_verified_at is null and identity_verified_by is null) or
         (identity_verified_at is not null and identity_verified_by is not null and
          length(trim(identity_verification_method))>=4 and length(trim(identity_verification_reference))>=4)),
  check ((status='suspended' and suspended_at is not null and suspended_by is not null and length(trim(suspension_reason))>=8) or status<>'suspended')
);

create table public.staff_permission_grants (
  user_id uuid not null references public.staff_memberships(user_id) on delete restrict,
  permission_key text not null references public.staff_permissions(permission_key) on delete restrict,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

create table public.super_admin_bootstrap_requests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.staff_invitations(id) on delete restrict,
  target_user_id uuid not null unique references auth.users(id) on delete restrict,
  target_email text not null unique,
  approval_reference text not null,
  status public.bootstrap_status not null default 'approved',
  approved_at timestamptz not null default now(),
  invited_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (target_email=lower(trim(target_email))),
  check (length(trim(approval_reference))>=8),
  check (expires_at>approved_at)
);

create unique index one_completed_super_admin_bootstrap_idx
on public.super_admin_bootstrap_requests((status='completed'))
where status='completed';

create table public.staff_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  invitation_id uuid references public.staff_invitations(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function private.reject_audit_mutation() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  raise exception 'staff audit history is immutable';
end;
$$;

create trigger staff_audit_events_immutable
before update or delete on public.staff_audit_events
for each row execute function private.reject_audit_mutation();

create or replace function private.has_staff_permission_for(target_user_id uuid, requested_permission text)
returns boolean language sql stable security definer set search_path=public,pg_catalog as $$
  select exists(
    select 1
    from public.staff_memberships membership
    join public.profiles profile on profile.id=membership.user_id
    where membership.user_id=target_user_id
      and membership.status='active'
      and profile.role=case when membership.staff_role='rider' then 'rider'::public.app_role else 'admin'::public.app_role end
      and (
        membership.staff_role='super_admin'
        or exists(
          select 1 from public.staff_permission_grants grant_record
          where grant_record.user_id=membership.user_id
            and grant_record.permission_key=requested_permission
        )
      )
  );
$$;

create or replace function private.current_staff_has_permission(requested_permission text)
returns boolean language sql stable security definer set search_path=public,auth,pg_catalog as $$
  select coalesce((auth.jwt()->>'aal')='aal2',false)
    and private.has_staff_permission_for(auth.uid(),requested_permission);
$$;

create or replace function private.current_staff_has_any_permission(requested_permissions text[])
returns boolean language sql stable security definer set search_path=public,auth,pg_catalog as $$
  select coalesce((auth.jwt()->>'aal')='aal2',false)
    and exists(select 1 from unnest(requested_permissions) permission where private.has_staff_permission_for(auth.uid(),permission));
$$;

revoke all on function private.reject_audit_mutation() from public,anon,authenticated;
revoke all on function private.has_staff_permission_for(uuid,text) from public,anon,authenticated;
revoke all on function private.current_staff_has_permission(text) from public,anon;
revoke all on function private.current_staff_has_any_permission(text[]) from public,anon;
grant execute on function private.current_staff_has_permission(text) to authenticated;
grant execute on function private.current_staff_has_any_permission(text[]) to authenticated;
grant execute on function private.has_staff_permission_for(uuid,text) to service_role;

alter table public.staff_permissions enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.staff_permission_grants enable row level security;
alter table public.super_admin_bootstrap_requests enable row level security;
alter table public.staff_audit_events enable row level security;

create policy staff_permissions_authorized_read on public.staff_permissions
for select to authenticated using (private.current_staff_has_permission('staff.view'));
create policy staff_invitations_authorized_read on public.staff_invitations
for select to authenticated using (private.current_staff_has_permission('staff.view'));
create policy staff_memberships_self_or_authorized_read on public.staff_memberships
for select to authenticated using (user_id=(select auth.uid()) or private.current_staff_has_permission('staff.view'));
create policy staff_permission_grants_self_or_authorized_read on public.staff_permission_grants
for select to authenticated using (user_id=(select auth.uid()) or private.current_staff_has_permission('staff.view'));
create policy bootstrap_target_read on public.super_admin_bootstrap_requests
for select to authenticated using (target_user_id=(select auth.uid()));
create policy staff_audit_authorized_read on public.staff_audit_events
for select to authenticated using (private.current_staff_has_permission('staff.view'));

revoke all on table public.staff_permissions,public.staff_invitations,public.staff_memberships,
  public.staff_permission_grants,public.super_admin_bootstrap_requests,public.staff_audit_events
from public,anon,authenticated;
grant select on table public.staff_permissions,public.staff_invitations,public.staff_memberships,
  public.staff_permission_grants,public.super_admin_bootstrap_requests,public.staff_audit_events
to authenticated;
grant all on table public.staff_permissions,public.staff_invitations,public.staff_memberships,
  public.staff_permission_grants,public.super_admin_bootstrap_requests,public.staff_audit_events
to service_role;
grant usage,select on sequence public.staff_audit_events_id_seq to service_role;

create or replace function public.has_role(required_role public.app_role) returns boolean
language sql stable security definer set search_path=public,auth,pg_catalog as $$
  select exists(
    select 1 from public.profiles profile
    where profile.id=auth.uid() and profile.role=required_role
      and case
        when required_role='admin' then coalesce((auth.jwt()->>'aal')='aal2',false) and exists(
          select 1 from public.staff_memberships membership
          where membership.user_id=profile.id and membership.status='active' and membership.staff_role in ('admin','super_admin')
        )
        when required_role='rider' then exists(
          select 1 from public.staff_memberships membership
          where membership.user_id=profile.id and membership.status='active' and membership.staff_role='rider'
        )
        else true
      end
  );
$$;

alter policy admin_pricing_configurations on public.pricing_configurations using (private.current_staff_has_permission('pricing.manage')) with check (private.current_staff_has_permission('pricing.manage'));
alter policy admin_pricing_versions on public.pricing_configuration_versions using (private.current_staff_has_permission('pricing.manage')) with check (private.current_staff_has_permission('pricing.manage'));
alter policy admin_rate_cards on public.rate_cards using (private.current_staff_has_permission('pricing.manage')) with check (private.current_staff_has_permission('pricing.manage'));
alter policy admin_rate_card_bands on public.rate_card_bands using (private.current_staff_has_permission('pricing.manage')) with check (private.current_staff_has_permission('pricing.manage'));
alter policy admin_quote_cost_estimates on public.quote_cost_estimates using (private.current_staff_has_permission('pricing.view'));
alter policy admin_competitors on public.competitors using (private.current_staff_has_permission('pricing.manage')) with check (private.current_staff_has_permission('pricing.manage'));
alter policy admin_competitor_quotes on public.competitor_quotes using (private.current_staff_has_permission('pricing.manage')) with check (private.current_staff_has_permission('pricing.manage'));
alter policy admin_promotions on public.promotions using (private.current_staff_has_permission('pricing.manage')) with check (private.current_staff_has_permission('pricing.manage'));
alter policy admin_delivery_expenses on public.delivery_expenses using (private.current_staff_has_permission('payments.reconcile')) with check (private.current_staff_has_permission('payments.reconcile'));
alter policy admin_payment_reconciliations on public.payment_reconciliations using (private.current_staff_has_permission('payments.reconcile')) with check (private.current_staff_has_permission('payments.reconcile'));
alter policy admin_compensation_plans on public.rider_compensation_plans using (private.current_staff_has_permission('riders.manage')) with check (private.current_staff_has_permission('riders.manage'));
alter policy admin_performance_records on public.rider_performance_records using (private.current_staff_has_any_permission(array['riders.manage','reports.view'])) with check (private.current_staff_has_permission('riders.manage'));
alter policy admin_monthly_bonuses on public.rider_monthly_bonuses using (private.current_staff_has_any_permission(array['riders.manage','reports.view'])) with check (private.current_staff_has_permission('riders.manage'));
alter policy admin_recurring_pickups on public.recurring_pickup_schedules using (private.current_staff_has_permission('bookings.manage')) with check (private.current_staff_has_permission('bookings.manage'));
alter policy admin_delivery_feedback on public.delivery_feedback using (private.current_staff_has_any_permission(array['bookings.manage','reports.view'])) with check (private.current_staff_has_permission('bookings.manage'));
alter policy admin_referrals on public.referrals using (private.current_staff_has_any_permission(array['bookings.manage','reports.view'])) with check (private.current_staff_has_permission('bookings.manage'));
alter policy admin_quotes_select on public.quotes using (private.current_staff_has_any_permission(array['bookings.manage','pricing.view','dispatch.manage']));
alter policy admin_orders_select on public.delivery_orders using (private.current_staff_has_any_permission(array['bookings.manage','dispatch.manage','reports.view']));
alter policy admin_packages_select on public.delivery_packages using (private.current_staff_has_any_permission(array['bookings.manage','dispatch.manage']));
alter policy admin_status_events_select on public.delivery_status_events using (private.current_staff_has_any_permission(array['bookings.manage','dispatch.manage']));
alter policy admin_service_zones_read on public.service_zones using (private.current_staff_has_permission('zones.manage'));
alter policy admin_zone_history_read on public.service_zone_change_history using (private.current_staff_has_permission('zones.manage'));
alter policy admin_operational_settings_read on public.service_area_operational_settings using (private.current_staff_has_any_permission(array['zones.manage','dispatch.manage']));
alter policy admin_availability_requests_read on public.delivery_availability_requests using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_fleet_read on public.fleet_vehicles using (private.current_staff_has_any_permission(array['dispatch.manage','riders.manage']));
alter policy admin_assignments_read on public.delivery_assignments using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_assisted_booking_read on public.assisted_booking_drafts using (private.current_staff_has_permission('bookings.manage'));
alter policy admin_assisted_events_read on public.assisted_booking_events using (private.current_staff_has_permission('bookings.manage'));
alter policy admin_delivery_runs_read on public.delivery_runs using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_delivery_run_stops_read on public.delivery_run_stops using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_run_assignments_read on public.run_assignments using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_run_history_read on public.delivery_run_change_history using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_custody_read on public.parcel_custody_events using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_expenses_read on public.delivery_expense_reports using (private.current_staff_has_any_permission(array['payments.view','payments.reconcile']));
alter policy admin_surcharges_read on public.customer_surcharges using (private.current_staff_has_any_permission(array['payments.view','payments.reconcile','dispatch.manage']));
alter policy admin_waiting_read on public.delivery_waiting_sessions using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_attempts_read on public.delivery_attempts using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_redelivery_read on public.redelivery_requests using (private.current_staff_has_any_permission(array['dispatch.manage','bookings.manage']));
alter policy admin_payer_changes_read on public.payer_change_requests using (private.current_staff_has_any_permission(array['payments.view','bookings.manage']));
alter policy admin_incidents_read on public.delivery_incidents using (private.current_staff_has_permission('dispatch.manage'));
alter policy admin_privileged_role_assignments_read on public.privileged_role_assignments using (private.current_staff_has_permission('staff.view'));

create or replace function public.finalize_initial_super_admin(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare bootstrap_record public.super_admin_bootstrap_requests%rowtype;
declare invitation_record public.staff_invitations%rowtype;
declare normalized_auth_email text;
begin
  select request.* into bootstrap_record
  from public.super_admin_bootstrap_requests request
  where request.target_user_id=$1
  for update;
  if not found then raise exception 'authorized bootstrap request not found'; end if;

  if bootstrap_record.status='completed' then
    return jsonb_build_object('status','completed','userId',target_user_id);
  end if;
  if bootstrap_record.status not in ('approved','invited') or bootstrap_record.expires_at<=now() then
    raise exception 'bootstrap approval is not active';
  end if;

  select lower(email) into normalized_auth_email
  from auth.users
  where id=target_user_id and email_confirmed_at is not null and deleted_at is null
    and (banned_until is null or banned_until<=now())
    and encrypted_password is not null and encrypted_password<>'';
  if normalized_auth_email is null or normalized_auth_email<>bootstrap_record.target_email then
    raise exception 'verified company email does not match bootstrap approval';
  end if;
  if not exists(
    select 1 from auth.mfa_factors
    where user_id=target_user_id and factor_type::text='totp' and status::text='verified'
  ) then raise exception 'verified multifactor authentication is required'; end if;
  if exists(
    select 1 from public.staff_memberships
    where staff_role='super_admin' and status='active' and user_id<>target_user_id
  ) then raise exception 'initial Super Admin already exists'; end if;

  select * into invitation_record from public.staff_invitations
  where id=bootstrap_record.invitation_id and auth_user_id=target_user_id and is_bootstrap=true
  for update;
  if not found or invitation_record.expires_at<=now() or invitation_record.status in ('expired','revoked') then
    raise exception 'bootstrap invitation is not active';
  end if;

  update public.profiles set role='admin',updated_at=now() where id=target_user_id;
  if not found then raise exception 'target profile not found'; end if;

  insert into public.staff_memberships(
    user_id,staff_role,status,invitation_id,identity_verified_at,identity_verified_by,
    identity_verification_method,identity_verification_reference,updated_at
  ) values(
    target_user_id,'super_admin','active',invitation_record.id,now(),target_user_id,
    'verified_company_email_and_totp',bootstrap_record.approval_reference,now()
  ) on conflict (user_id) do update set
    staff_role='super_admin',status='active',invitation_id=excluded.invitation_id,
    identity_verified_at=excluded.identity_verified_at,identity_verified_by=excluded.identity_verified_by,
    identity_verification_method=excluded.identity_verification_method,
    identity_verification_reference=excluded.identity_verification_reference,updated_at=now();

  insert into public.staff_permission_grants(user_id,permission_key,granted_by)
  select target_user_id,permission_key,target_user_id from public.staff_permissions
  on conflict (user_id,permission_key) do nothing;

  update public.staff_invitations set status='accepted',accepted_at=coalesce(accepted_at,now()),updated_at=now()
  where id=invitation_record.id;
  update public.super_admin_bootstrap_requests set status='completed',completed_at=now()
  where id=bootstrap_record.id;

  insert into public.staff_audit_events(actor_id,action,target_user_id,invitation_id,metadata)
  values(target_user_id,'super_admin.bootstrap.completed',target_user_id,invitation_record.id,
    jsonb_build_object('bootstrapRequestId',bootstrap_record.id,'emailOwnershipVerified',true,'mfaVerified',true));
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(target_user_id,'super_admin','super_admin.bootstrap.completed','profile',target_user_id,
    jsonb_build_object('bootstrapRequestId',bootstrap_record.id,'invitationId',invitation_record.id));
  return jsonb_build_object('status','completed','userId',target_user_id);
end;
$$;

create or replace function public.prepare_initial_super_admin_bootstrap(
  target_user_id uuid,
  target_email text,
  approval_reference text,
  invitation_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare normalized_email text := lower(trim(target_email));
declare invitation_id uuid;
declare bootstrap_id uuid;
declare existing_status public.bootstrap_status;
begin
  if length(trim(approval_reference))<8 then raise exception 'explicit bootstrap approval reference required'; end if;
  if invitation_expires_at<=now() or invitation_expires_at>now()+interval '24 hours' then raise exception 'bootstrap invitation expiry must be within 24 hours'; end if;
  if not exists(select 1 from auth.users where id=target_user_id and lower(email)=normalized_email and deleted_at is null) then
    raise exception 'bootstrap identity does not match the intended email';
  end if;
  if exists(select 1 from public.staff_memberships where staff_role='super_admin' and status='active' and user_id<>target_user_id) then
    raise exception 'an active Super Admin already exists';
  end if;

  select request.id,request.status into bootstrap_id,existing_status from public.super_admin_bootstrap_requests request
  where request.target_user_id=$1 for update;
  if found then
    if existing_status='completed' then return jsonb_build_object('bootstrapRequestId',bootstrap_id,'status','completed'); end if;
    select request.invitation_id into invitation_id from public.super_admin_bootstrap_requests request where request.id=bootstrap_id;
    update public.staff_invitations set status='sent',sent_at=now(),expires_at=invitation_expires_at,updated_at=now()
    where id=invitation_id and status not in ('accepted','revoked');
    update public.super_admin_bootstrap_requests set status='invited',invited_at=now(),expires_at=invitation_expires_at
    where id=bootstrap_id and status not in ('completed','cancelled');
    insert into public.staff_audit_events(actor_id,action,target_user_id,invitation_id,metadata)
    values(null,'super_admin.bootstrap.invitation.resent',target_user_id,invitation_id,jsonb_build_object('bootstrapRequestId',bootstrap_id));
    return jsonb_build_object('bootstrapRequestId',bootstrap_id,'invitationId',invitation_id,'status','invited');
  end if;
  if exists(select 1 from public.super_admin_bootstrap_requests where status='completed') then raise exception 'initial Super Admin bootstrap has already been completed'; end if;

  insert into public.staff_invitations(email,intended_role,status,auth_user_id,is_bootstrap,sent_at,expires_at)
  values(normalized_email,'super_admin','sent',target_user_id,true,now(),invitation_expires_at)
  returning id into invitation_id;
  insert into public.super_admin_bootstrap_requests(invitation_id,target_user_id,target_email,approval_reference,status,invited_at,expires_at)
  values(invitation_id,target_user_id,normalized_email,approval_reference,'invited',now(),invitation_expires_at)
  returning id into bootstrap_id;
  insert into public.staff_audit_events(actor_id,action,target_user_id,invitation_id,metadata)
  values(null,'super_admin.bootstrap.invitation.sent',target_user_id,invitation_id,
    jsonb_build_object('bootstrapRequestId',bootstrap_id,'explicitApprovalRecorded',true));
  return jsonb_build_object('bootstrapRequestId',bootstrap_id,'invitationId',invitation_id,'status','invited');
end;
$$;

create or replace function public.accept_staff_invitation(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare invitation_record public.staff_invitations%rowtype;
declare normalized_auth_email text;
begin
  select lower(email) into normalized_auth_email from auth.users
  where id=target_user_id and email_confirmed_at is not null and deleted_at is null
    and (banned_until is null or banned_until<=now())
    and encrypted_password is not null and encrypted_password<>'';
  if normalized_auth_email is null then raise exception 'verified active identity required'; end if;

  select * into invitation_record from public.staff_invitations
  where email=normalized_auth_email and auth_user_id=target_user_id and is_bootstrap=false
    and status in ('sent','accepted')
  order by created_at desc limit 1 for update;
  if not found or invitation_record.expires_at<=now() then raise exception 'active staff invitation not found'; end if;
  if invitation_record.intended_role='admin' and not exists(
    select 1 from auth.mfa_factors where user_id=target_user_id and factor_type::text='totp' and status::text='verified'
  ) then raise exception 'verified multifactor authentication is required for administrators'; end if;

  insert into public.staff_memberships(user_id,staff_role,status,invitation_id)
  values(target_user_id,invitation_record.intended_role,'pending',invitation_record.id)
  on conflict (user_id) do update set
    staff_role=excluded.staff_role,status='pending',invitation_id=excluded.invitation_id,updated_at=now();
  update public.staff_invitations set status='accepted',accepted_at=coalesce(accepted_at,now()),updated_at=now()
  where id=invitation_record.id;
  insert into public.staff_audit_events(actor_id,action,target_user_id,invitation_id,metadata)
  values(target_user_id,'staff.invitation.accepted',target_user_id,invitation_record.id,
    jsonb_build_object('intendedRole',invitation_record.intended_role));
  return jsonb_build_object('status','pending_verification','role',invitation_record.intended_role);
end;
$$;

create or replace function public.register_staff_invitation(
  target_email text,
  intended_role public.staff_role,
  target_auth_user_id uuid,
  actor_id uuid,
  requested_permissions text[],
  invitation_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare invitation_id uuid;
declare normalized_email text := lower(trim(target_email));
begin
  if intended_role not in ('admin','rider') then raise exception 'only administrators and riders may be invited'; end if;
  if intended_role='admin' then
    if not private.has_staff_permission_for(actor_id,'admins.invite') then raise exception 'Super Admin authorization required'; end if;
  elsif not private.has_staff_permission_for(actor_id,'riders.invite') then
    raise exception 'rider invitation authorization required';
  end if;
  if invitation_expires_at<=now() or invitation_expires_at>now()+interval '7 days' then raise exception 'invitation expiry must be within seven days'; end if;
  if exists(select 1 from public.staff_memberships where user_id=target_auth_user_id and status in ('pending','active','suspended')) then
    raise exception 'this identity already has a staff membership';
  end if;
  if exists(select 1 from public.staff_invitations where email=normalized_email and status in ('pending','sent','accepted')) then
    raise exception 'an active invitation already exists for this email';
  end if;
  if requested_permissions && array['admins.invite','admins.manage_permissions']::text[] then
    raise exception 'Super Admin permissions cannot be delegated';
  end if;
  if intended_role='rider' and cardinality(requested_permissions)>0 then raise exception 'rider invitations cannot include administrative permissions'; end if;
  if exists(select 1 from unnest(requested_permissions) key left join public.staff_permissions permission on permission.permission_key=key where permission.permission_key is null) then
    raise exception 'unknown staff permission';
  end if;

  insert into public.staff_invitations(email,intended_role,status,requested_permissions,auth_user_id,invited_by,sent_at,expires_at)
  values(normalized_email,intended_role,'sent',requested_permissions,target_auth_user_id,actor_id,now(),invitation_expires_at)
  returning id into invitation_id;
  insert into public.staff_audit_events(actor_id,action,target_user_id,invitation_id,metadata)
  values(actor_id,'staff.invitation.sent',target_auth_user_id,invitation_id,
    jsonb_build_object('intendedRole',intended_role,'expiresAt',invitation_expires_at,'permissions',requested_permissions));
  return invitation_id;
end;
$$;

create or replace function public.activate_staff_member(
  target_user_id uuid,
  actor_id uuid,
  verification_method text,
  verification_reference text,
  activation_reason text
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare membership_record public.staff_memberships%rowtype;
declare invitation_record public.staff_invitations%rowtype;
begin
  if length(trim(verification_method))<4 or length(trim(verification_reference))<4 or length(trim(activation_reason))<8 then
    raise exception 'complete identity verification evidence and activation reason are required';
  end if;
  select * into membership_record from public.staff_memberships where user_id=target_user_id for update;
  if not found or membership_record.staff_role='super_admin' then raise exception 'eligible pending staff membership not found'; end if;
  if membership_record.staff_role='admin' then
    if not private.has_staff_permission_for(actor_id,'admins.manage_permissions') then raise exception 'Super Admin authorization required'; end if;
    if not exists(select 1 from auth.mfa_factors where user_id=target_user_id and factor_type::text='totp' and status::text='verified') then
      raise exception 'verified multifactor authentication is required for administrators';
    end if;
  elsif not private.has_staff_permission_for(actor_id,'riders.manage') then
    raise exception 'rider management authorization required';
  end if;
  if not exists(select 1 from auth.users where id=target_user_id and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now())) then
    raise exception 'verified active identity required';
  end if;

  select * into invitation_record from public.staff_invitations where id=membership_record.invitation_id for update;
  if not found or invitation_record.status<>'accepted' or invitation_record.expires_at<=now() then raise exception 'accepted invitation required'; end if;

  update public.staff_memberships set status='active',identity_verified_at=now(),identity_verified_by=actor_id,
    identity_verification_method=verification_method,identity_verification_reference=verification_reference,
    suspended_at=null,suspended_by=null,suspension_reason=null,updated_at=now()
  where user_id=target_user_id;
  update public.profiles set role=case when membership_record.staff_role='rider' then 'rider'::public.app_role else 'admin'::public.app_role end,
    updated_at=now() where id=target_user_id;
  insert into public.staff_permission_grants(user_id,permission_key,granted_by)
  select target_user_id,requested_permission,actor_id
  from unnest(invitation_record.requested_permissions) requested_permission
  join public.staff_permissions permission on permission.permission_key=requested_permission
  where requested_permission not in ('admins.invite','admins.manage_permissions')
  on conflict (user_id,permission_key) do nothing;
  insert into public.staff_audit_events(actor_id,action,target_user_id,invitation_id,metadata)
  values(actor_id,'staff.activated',target_user_id,membership_record.invitation_id,
    jsonb_build_object('role',membership_record.staff_role,'verificationMethod',verification_method,'reason',activation_reason));
  return jsonb_build_object('status','active','role',membership_record.staff_role);
end;
$$;

create or replace function public.set_staff_member_status(
  target_user_id uuid,
  actor_id uuid,
  next_status public.staff_status,
  change_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare membership_record public.staff_memberships%rowtype;
begin
  if next_status not in ('active','suspended','revoked') or length(trim(change_reason))<8 then raise exception 'valid status and reason required'; end if;
  select * into membership_record from public.staff_memberships where user_id=target_user_id for update;
  if not found then raise exception 'staff membership not found'; end if;
  if membership_record.staff_role in ('super_admin','admin') then
    if not private.has_staff_permission_for(actor_id,'admins.manage_permissions') then raise exception 'Super Admin authorization required'; end if;
  elsif not private.has_staff_permission_for(actor_id,'staff.suspend') then
    raise exception 'staff suspension authorization required';
  end if;
  if membership_record.staff_role='super_admin' and next_status<>'active' and not exists(
    select 1 from public.staff_memberships where staff_role='super_admin' and status='active' and user_id<>target_user_id
  ) then raise exception 'the last active Super Admin cannot be suspended or revoked'; end if;
  if next_status='active' and membership_record.identity_verified_at is null then raise exception 'identity verification required before activation'; end if;

  update public.staff_memberships set status=next_status,
    suspended_at=case when next_status='suspended' then now() else null end,
    suspended_by=case when next_status='suspended' then actor_id else null end,
    suspension_reason=case when next_status='suspended' then change_reason else null end,
    updated_at=now() where user_id=target_user_id;
  update public.profiles set role=case when next_status='active' and membership_record.staff_role='rider' then 'rider'::public.app_role
    when next_status='active' then 'admin'::public.app_role else 'customer'::public.app_role end,
    updated_at=now() where id=target_user_id;
  insert into public.staff_audit_events(actor_id,action,target_user_id,invitation_id,metadata)
  values(actor_id,'staff.status.changed',target_user_id,membership_record.invitation_id,
    jsonb_build_object('previousStatus',membership_record.status,'nextStatus',next_status,'reason',change_reason));
  return jsonb_build_object('status',next_status,'role',membership_record.staff_role);
end;
$$;

create or replace function public.replace_staff_permissions(
  target_user_id uuid,
  actor_id uuid,
  requested_permissions text[],
  change_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare membership_record public.staff_memberships%rowtype;
begin
  if not private.has_staff_permission_for(actor_id,'admins.manage_permissions') then raise exception 'Super Admin authorization required'; end if;
  if length(trim(change_reason))<8 then raise exception 'permission change reason required'; end if;
  select * into membership_record from public.staff_memberships where user_id=target_user_id for update;
  if not found or membership_record.staff_role<>'admin' then raise exception 'administrator membership required'; end if;
  if requested_permissions && array['admins.invite','admins.manage_permissions']::text[] then
    raise exception 'Super Admin permissions cannot be delegated';
  end if;
  if exists(select 1 from unnest(requested_permissions) key left join public.staff_permissions permission on permission.permission_key=key where permission.permission_key is null) then
    raise exception 'unknown staff permission';
  end if;
  delete from public.staff_permission_grants where user_id=target_user_id;
  insert into public.staff_permission_grants(user_id,permission_key,granted_by)
  select target_user_id,key,actor_id from (select distinct unnest(requested_permissions) key) requested;
  insert into public.staff_audit_events(actor_id,action,target_user_id,invitation_id,metadata)
  values(actor_id,'staff.permissions.replaced',target_user_id,membership_record.invitation_id,
    jsonb_build_object('permissions',requested_permissions,'reason',change_reason));
  return jsonb_build_object('permissions',requested_permissions);
end;
$$;

-- Disable the previous first-admin self-bootstrap path. All future privileged role
-- changes must use the verified invitation and staff-management procedures above.
create or replace function public.assign_verified_application_role(
  target_user_id uuid,
  target_role public.app_role,
  actor_id uuid,
  verification_method text,
  verification_reference text,
  assignment_reason text,
  request_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform target_user_id,target_role,actor_id,verification_method,verification_reference,assignment_reason,request_idempotency_key;
  raise exception 'legacy role assignment is disabled; use the staff invitation workflow';
end;
$$;

revoke all on function public.finalize_initial_super_admin(uuid) from public,anon,authenticated;
revoke all on function public.prepare_initial_super_admin_bootstrap(uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.accept_staff_invitation(uuid) from public,anon,authenticated;
revoke all on function public.register_staff_invitation(text,public.staff_role,uuid,uuid,text[],timestamptz) from public,anon,authenticated;
revoke all on function public.activate_staff_member(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.set_staff_member_status(uuid,uuid,public.staff_status,text) from public,anon,authenticated;
revoke all on function public.replace_staff_permissions(uuid,uuid,text[],text) from public,anon,authenticated;
revoke all on function public.assign_verified_application_role(uuid,public.app_role,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.finalize_initial_super_admin(uuid) to service_role;
grant execute on function public.prepare_initial_super_admin_bootstrap(uuid,text,text,timestamptz) to service_role;
grant execute on function public.accept_staff_invitation(uuid) to service_role;
grant execute on function public.register_staff_invitation(text,public.staff_role,uuid,uuid,text[],timestamptz) to service_role;
grant execute on function public.activate_staff_member(uuid,uuid,text,text,text) to service_role;
grant execute on function public.set_staff_member_status(uuid,uuid,public.staff_status,text) to service_role;
grant execute on function public.replace_staff_permissions(uuid,uuid,text[],text) to service_role;

insert into public.staff_audit_events(actor_id,action,metadata)
values(null,'staff.management.schema.installed',jsonb_build_object('legacySelfBootstrapDisabled',true));
