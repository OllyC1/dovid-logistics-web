select
  p.oid::regprocedure::text as function_signature,
  p.proconfig as function_configuration,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by function_signature;

select p.oid::regprocedure::text as security_definer_without_fixed_search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, array[]::text[])) configuration
    where configuration like 'search_path=%'
  );

do $$
declare
  protected_table text;
  application_role text;
  table_privilege text;
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig,array[]::text[])) configuration
        where configuration like 'search_path=%'
      )
  ) then
    raise exception 'public SECURITY DEFINER function without fixed search_path';
  end if;

  foreach protected_table in array array[
    'email_provider_events',
    'guest_order_access_tokens',
    'guest_quote_access_tokens',
    'notification_delivery_attempts'
  ] loop
    foreach application_role in array array['anon','authenticated'] loop
      foreach table_privilege in array array[
        'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
      ] loop
        if has_table_privilege(
          application_role,
          format('public.%I',protected_table),
          table_privilege
        ) then
          raise exception '% unexpectedly has % on public.%',
            application_role,table_privilege,protected_table;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

select 'SECURITY DEFINER and intentional deny-all RLS validation passed' as result;
