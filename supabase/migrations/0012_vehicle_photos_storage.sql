-- ============================================================
-- AutoRD vehicle photos
-- Public marketplace images uploaded by the dealer that owns the car.
-- ============================================================

alter table public.vehicle_photos
  add column if not exists storage_path text,
  add column if not exists is_cover boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_vehicle_photos_vehicle_position
  on public.vehicle_photos (vehicle_id, position);

create unique index if not exists idx_vehicle_photos_one_cover
  on public.vehicle_photos (vehicle_id)
  where is_cover;

grant select on public.vehicle_photos to anon, authenticated;
grant insert, update, delete on public.vehicle_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  true,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.vehicle_storage_vehicle_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, storage
as $$
declare
  first_folder text;
begin
  first_folder := (storage.foldername(object_name))[1];

  if first_folder is null or first_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  return first_folder::uuid;
end;
$$;

revoke all on function public.vehicle_storage_vehicle_id(text) from public;
grant execute on function public.vehicle_storage_vehicle_id(text) to anon, authenticated, service_role;

drop policy if exists vehicle_photos_storage_read_manage on storage.objects;
drop policy if exists vehicle_photos_storage_upload on storage.objects;
drop policy if exists vehicle_photos_storage_update on storage.objects;
drop policy if exists vehicle_photos_storage_delete on storage.objects;

create policy vehicle_photos_storage_read_manage
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and exists (
    select 1
    from public.vehicles v
    where v.id = public.vehicle_storage_vehicle_id(name)
      and (v.dealer_id = public.auth_dealer_id() or public.is_admin())
  )
);

create policy vehicle_photos_storage_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-photos'
  and exists (
    select 1
    from public.vehicles v
    where v.id = public.vehicle_storage_vehicle_id(name)
      and (v.dealer_id = public.auth_dealer_id() or public.is_admin())
  )
);

create policy vehicle_photos_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and exists (
    select 1
    from public.vehicles v
    where v.id = public.vehicle_storage_vehicle_id(name)
      and (v.dealer_id = public.auth_dealer_id() or public.is_admin())
  )
)
with check (
  bucket_id = 'vehicle-photos'
  and exists (
    select 1
    from public.vehicles v
    where v.id = public.vehicle_storage_vehicle_id(name)
      and (v.dealer_id = public.auth_dealer_id() or public.is_admin())
  )
);

create policy vehicle_photos_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and exists (
    select 1
    from public.vehicles v
    where v.id = public.vehicle_storage_vehicle_id(name)
      and (v.dealer_id = public.auth_dealer_id() or public.is_admin())
  )
);

create or replace function public.refresh_vehicle_photos_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_vehicle uuid;
begin
  target_vehicle := coalesce(new.vehicle_id, old.vehicle_id);

  update public.vehicles v
  set photos_count = (
    select count(*)::int
    from public.vehicle_photos p
    where p.vehicle_id = v.id
  )
  where v.id = target_vehicle;

  if tg_op = 'UPDATE' and old.vehicle_id is distinct from new.vehicle_id then
    update public.vehicles v
    set photos_count = (
      select count(*)::int
      from public.vehicle_photos p
      where p.vehicle_id = v.id
    )
    where v.id = old.vehicle_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_refresh_vehicle_photos_count on public.vehicle_photos;
create trigger trg_refresh_vehicle_photos_count
after insert or update or delete on public.vehicle_photos
for each row execute function public.refresh_vehicle_photos_count();
