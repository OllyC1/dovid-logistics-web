-- Require MFA only for the Super Admin while preserving trusted membership checks.

create or replace function private.current_staff_has_permission(requested_permission text)
returns boolean language sql stable security definer set search_path=public,auth,pg_catalog as $$
  select private.has_staff_permission_for(auth.uid(),requested_permission)
    and exists(
      select 1
      from public.staff_memberships membership
      where membership.user_id=auth.uid()
        and membership.status='active'
        and (
          membership.staff_role<>'super_admin'
          or coalesce((auth.jwt()->>'aal')='aal2',false)
        )
    );
$$;

create or replace function private.current_staff_has_any_permission(requested_permissions text[])
returns boolean language sql stable security definer set search_path=public,auth,pg_catalog as $$
  select exists(
      select 1
      from public.staff_memberships membership
      where membership.user_id=auth.uid()
        and membership.status='active'
        and (
          membership.staff_role<>'super_admin'
          or coalesce((auth.jwt()->>'aal')='aal2',false)
        )
    )
    and exists(
      select 1
      from unnest(requested_permissions) permission
      where private.has_staff_permission_for(auth.uid(),permission)
    );
$$;

create or replace function public.has_role(required_role public.app_role)
returns boolean language sql stable security definer set search_path=public,auth,pg_catalog as $$
  select exists(
    select 1
    from public.profiles profile
    where profile.id=auth.uid()
      and profile.role=required_role
      and case
        when required_role='admin' then exists(
          select 1
          from public.staff_memberships membership
          where membership.user_id=profile.id
            and membership.status='active'
            and membership.staff_role in ('admin','super_admin')
            and (
              membership.staff_role<>'super_admin'
              or coalesce((auth.jwt()->>'aal')='aal2',false)
            )
        )
        when required_role='rider' then exists(
          select 1
          from public.staff_memberships membership
          where membership.user_id=profile.id
            and membership.status='active'
            and membership.staff_role='rider'
        )
        else true
      end
  );
$$;

revoke all on function private.current_staff_has_permission(text) from public,anon;
revoke all on function private.current_staff_has_any_permission(text[]) from public,anon;
grant execute on function private.current_staff_has_permission(text) to authenticated;
grant execute on function private.current_staff_has_any_permission(text[]) to authenticated;
revoke all on function public.has_role(public.app_role) from public,anon;
grant execute on function public.has_role(public.app_role) to authenticated,service_role;
