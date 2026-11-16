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

revoke all on function public.accept_staff_invitation(uuid) from public,anon,authenticated;
revoke all on function public.activate_staff_member(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.accept_staff_invitation(uuid) to service_role;
grant execute on function public.activate_staff_member(uuid,uuid,text,text,text) to service_role;
