do $$
begin
  if not exists(select 1 from pg_type where typnamespace='public'::regnamespace and typname='staff_role') then
    raise exception 'staff_role enum missing';
  end if;
  if not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname='staff_memberships' and relrowsecurity) then
    raise exception 'staff_memberships RLS missing';
  end if;
  if not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname='staff_invitations' and relrowsecurity) then
    raise exception 'staff_invitations RLS missing';
  end if;
  if has_function_privilege('authenticated','public.finalize_initial_super_admin(uuid)','execute') then
    raise exception 'authenticated must not execute founder bootstrap finalization';
  end if;
  if not has_function_privilege('service_role','public.finalize_initial_super_admin(uuid)','execute') then
    raise exception 'service role must execute founder bootstrap finalization';
  end if;
  if exists(select 1 from public.staff_permission_grants where permission_key in ('admins.invite','admins.manage_permissions')) then
    raise exception 'reserved Super Admin permissions must not be delegated';
  end if;
end;
$$;
