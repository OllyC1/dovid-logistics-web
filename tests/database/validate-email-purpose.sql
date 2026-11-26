begin;

do $$
declare function_definition text;
begin
  function_definition := pg_get_functiondef('private.queue_order_email(uuid,text,text,text,text,integer,jsonb)'::regprocedure);

  if position('Track it here:' in function_definition) > 0 then
    raise exception 'order email body still embeds a generic raw tracking path';
  end if;
  if position('jsonb_build_object(''actionPath'', action_path)' in function_definition) = 0 then
    raise exception 'order email metadata does not use the resolved customer or guest action path';
  end if;
  if function_definition !~ '\)\s*\|\|\s*notification_metadata\s*\|\|\s*jsonb_build_object\(''actionPath'',\s*action_path\)' then
    raise exception 'event-specific email metadata does not override base order metadata';
  end if;
  if has_function_privilege('anon', 'private.queue_order_email(uuid,text,text,text,text,integer,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'private.queue_order_email(uuid,text,text,text,text,integer,jsonb)', 'execute') then
    raise exception 'private order email queue function is exposed to application roles';
  end if;
end;
$$;

rollback;

select 'purpose-specific email database validation passed' as result;
