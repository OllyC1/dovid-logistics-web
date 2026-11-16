-- Prevent terminal email failures from being reclaimed by the scheduled worker.

create or replace function public.claim_email_notifications(worker_token uuid, batch_limit integer default 10)
returns setof public.notifications
language plpgsql security definer set search_path=public,auth as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  if worker_token is null then raise exception 'worker token required'; end if;
  return query
  with candidates as (
    select id from public.notifications
    where channel='email'
      and recipient_email is not null
      and subject is not null
      and attempt_count < 8
      and (
        status='queued'
        or (status='failed' and next_attempt_at is not null and next_attempt_at<=now())
        or (status='sending' and lease_expires_at<now())
      )
    order by priority desc,coalesce(next_attempt_at,created_at),created_at
    for update skip locked
    limit greatest(1,least(batch_limit,25))
  )
  update public.notifications n
  set status='sending',claim_token=worker_token,claimed_at=now(),lease_expires_at=now()+interval '5 minutes',attempt_count=attempt_count+1
  from candidates c where n.id=c.id
  returning n.*;
end;
$$;

revoke all on function public.claim_email_notifications(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_email_notifications(uuid,integer) to service_role;
