update public.service_zones
set booking_eligibility='manual_approval',
    dispatch_approval_required=true,
    updated_at=now()
where code='F';

insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
select
  (select id from public.profiles where id='68d11a41-56eb-4115-879e-bb6c6e248a88'::uuid),
  'admin',
  'service_zone.outskirts_approval_enforced',
  'service_zone',
  id,
  jsonb_build_object('code',code,'bookingEligibility','manual_approval','dispatchApprovalRequired',true)
from public.service_zones
where code='F'
  and not exists(
    select 1 from public.audit_logs
    where resource_id=(select id from public.service_zones where code='F')
      and action='service_zone.outskirts_approval_enforced'
  );
