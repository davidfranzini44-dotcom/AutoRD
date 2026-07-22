-- ============================================================
-- AutoRD Joselito Auto Import photos
-- Static image files are stored in /public/vehicle-photos so the marketplace
-- uses AutoRD-hosted copies instead of hotlinking the SuperCarros URLs.
-- ============================================================

with target_vehicles(slug) as (
  values
    ('lexus-rx-350-f-sport-2022-joselito'),
    ('toyota-grand-highlander-platinum-hybrid-2024-joselito'),
    ('lexus-lx-600-luxury-2024-joselito')
)
update public.vehicle_photos p
set is_cover = false
from public.vehicles v, target_vehicles t
where p.vehicle_id = v.id
  and v.slug = t.slug;

with target_vehicles(slug) as (
  values
    ('lexus-rx-350-f-sport-2022-joselito'),
    ('toyota-grand-highlander-platinum-hybrid-2024-joselito'),
    ('lexus-lx-600-luxury-2024-joselito')
)
delete from public.vehicle_photos p
using public.vehicles v, target_vehicles t
where p.vehicle_id = v.id
  and v.slug = t.slug
  and p.url like '/vehicle-photos/joselito/%';

with photo_sets(vehicle_slug, base_path, prefix, total) as (
  values
    (
      'lexus-rx-350-f-sport-2022-joselito',
      '/vehicle-photos/joselito/lexus-rx-350-f-sport-2022',
      'rx',
      12
    ),
    (
      'toyota-grand-highlander-platinum-hybrid-2024-joselito',
      '/vehicle-photos/joselito/toyota-grand-highlander-2024',
      'grand-highlander',
      12
    ),
    (
      'lexus-lx-600-luxury-2024-joselito',
      '/vehicle-photos/joselito/lexus-lx-600-luxury-2024',
      'lx',
      11
    )
),
expanded as (
  select
    s.vehicle_slug,
    s.base_path || '/' || s.prefix || '-' || lpad(g.n::text, 2, '0') || '.jpg' as url,
    g.n - 1 as position,
    g.n = 1 as is_cover
  from photo_sets s
  cross join lateral generate_series(1, s.total) as g(n)
)
insert into public.vehicle_photos
  (vehicle_id, url, position, is_cover)
select
  v.id,
  e.url,
  e.position,
  e.is_cover
from expanded e
join public.vehicles v on v.slug = e.vehicle_slug
order by e.vehicle_slug, e.position;

update public.vehicles v
set photos_count = p.total
from (
  select vehicle_id, count(*)::int as total
  from public.vehicle_photos
  group by vehicle_id
) p
where v.id = p.vehicle_id
  and v.slug in (
    'lexus-rx-350-f-sport-2022-joselito',
    'toyota-grand-highlander-platinum-hybrid-2024-joselito',
    'lexus-lx-600-luxury-2024-joselito'
  );
