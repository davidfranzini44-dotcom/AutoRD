-- Dealership photos gallery (fotos del local) + public storage bucket.
alter table dealers add column if not exists photos jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('dealer-photos', 'dealer-photos', true)
on conflict (id) do nothing;

drop policy if exists dealer_photos_read on storage.objects;
create policy dealer_photos_read on storage.objects
  for select using (bucket_id = 'dealer-photos');

drop policy if exists dealer_photos_upload on storage.objects;
create policy dealer_photos_upload on storage.objects
  for insert with check (
    bucket_id = 'dealer-photos'
    and (split_part(name, '/', 1) = auth_dealer_id()::text or is_admin())
  );

drop policy if exists dealer_photos_update on storage.objects;
create policy dealer_photos_update on storage.objects
  for update using (
    bucket_id = 'dealer-photos'
    and (split_part(name, '/', 1) = auth_dealer_id()::text or is_admin())
  ) with check (
    bucket_id = 'dealer-photos'
    and (split_part(name, '/', 1) = auth_dealer_id()::text or is_admin())
  );

drop policy if exists dealer_photos_delete on storage.objects;
create policy dealer_photos_delete on storage.objects
  for delete using (
    bucket_id = 'dealer-photos'
    and (split_part(name, '/', 1) = auth_dealer_id()::text or is_admin())
  );
