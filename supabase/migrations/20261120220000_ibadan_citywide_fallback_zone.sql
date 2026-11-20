alter table public.service_zones
  add column if not exists is_citywide boolean not null default false;

comment on column public.service_zones.is_citywide is
  'Marks a whole-city fallback boundary that may intentionally contain the priority operational zones.';

with flattened_polygons as (
  select jsonb_array_elements(
    case
      when boundary_geojson->'geometry'->>'type' = 'Polygon'
        then jsonb_build_array(boundary_geojson->'geometry'->'coordinates')
      else boundary_geojson->'geometry'->'coordinates'
    end
  ) as polygon
  from public.service_zones
  where code between 'A' and 'F'
    and boundary_geojson is not null
), city_boundary as (
  select jsonb_build_object(
    'type', 'Feature',
    'properties', jsonb_build_object(
      'code', 'IBD',
      'source', 'OpenStreetMap',
      'description', 'Whole-Ibadan fallback assembled from reviewed Zones A-F'
    ),
    'geometry', jsonb_build_object(
      'type', 'MultiPolygon',
      'coordinates', (select jsonb_agg(polygon) from flattened_polygons)
    )
  ) as boundary_geojson
)
insert into public.service_zones(
  id,service_area_id,name,code,boundary_geojson,active,operational_status,
  booking_eligibility,dispatch_approval_required,priority,boundary_source,review_notes,
  is_citywide,approved_by,approved_at,approval_boundary_hash
)
select
  '10000000-0000-4000-8000-0000000000d0'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  'Ibadan',
  'IBD',
  city_boundary.boundary_geojson,
  true,
  'active',
  'manual_approval',
  true,
  100,
  'OpenStreetMap contributors (ODbL), assembled from reviewed Zones A-F',
  'Whole-city fallback for Ibadan. Priority Zones A-F are evaluated first; routes covered only by this fallback require dispatch approval.',
  true,
  (select id from public.profiles where id='68d11a41-56eb-4115-879e-bb6c6e248a88'::uuid),
  now(),
  encode(extensions.digest(city_boundary.boundary_geojson::text,'sha256'),'hex')
from city_boundary
on conflict (id) do update
set boundary_geojson = excluded.boundary_geojson,
    active = true,
    operational_status = 'active',
    booking_eligibility = 'manual_approval',
    dispatch_approval_required = true,
    priority = 100,
    boundary_source = excluded.boundary_source,
    review_notes = excluded.review_notes,
    is_citywide = true,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    approval_boundary_hash = encode(extensions.digest(excluded.boundary_geojson::text,'sha256'),'hex'),
    updated_at = now();

insert into public.service_zone_change_history(
  zone_id,action,boundary_geojson,settings_snapshot,changed_by,change_reason
)
select
  id,'activated',boundary_geojson,to_jsonb(service_zones)-'boundary_geojson',
  (select id from public.profiles where id='68d11a41-56eb-4115-879e-bb6c6e248a88'::uuid),
  'Founder-approved whole-Ibadan manual-approval fallback; priority Zones A-F remain authoritative.'
from public.service_zones
where id='10000000-0000-4000-8000-0000000000d0'::uuid
  and not exists(
    select 1 from public.service_zone_change_history
    where zone_id='10000000-0000-4000-8000-0000000000d0'::uuid
      and action='activated'
  );

insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
select
  (select id from public.profiles where id='68d11a41-56eb-4115-879e-bb6c6e248a88'::uuid),
  'admin',
  'service_zone.citywide_fallback_approved',
  'service_zone',
  id,
  jsonb_build_object(
    'code',code,
    'bookingEligibility',booking_eligibility,
    'dispatchApprovalRequired',dispatch_approval_required,
    'priority',priority,
    'approvedBy','Dovid Logistics'
  )
from public.service_zones
where id='10000000-0000-4000-8000-0000000000d0'::uuid
  and not exists(
    select 1 from public.audit_logs
    where resource_id='10000000-0000-4000-8000-0000000000d0'::uuid
      and action='service_zone.citywide_fallback_approved'
  );
