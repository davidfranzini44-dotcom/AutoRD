-- Public storage bucket for dealer logos; writes scoped to the owning dealer.
insert into storage.buckets (id, name, public)
values ('dealer-logos', 'dealer-logos', true)
on conflict (id) do nothing;

drop policy if exists dealer_logos_read on storage.objects;
create policy dealer_logos_read on storage.objects
  for select using (bucket_id = 'dealer-logos');

drop policy if exists dealer_logos_upload on storage.objects;
create policy dealer_logos_upload on storage.objects
  for insert with check (
    bucket_id = 'dealer-logos'
    and (split_part(name, '/', 1) = auth_dealer_id()::text or is_admin())
  );

drop policy if exists dealer_logos_update on storage.objects;
create policy dealer_logos_update on storage.objects
  for update using (
    bucket_id = 'dealer-logos'
    and (split_part(name, '/', 1) = auth_dealer_id()::text or is_admin())
  ) with check (
    bucket_id = 'dealer-logos'
    and (split_part(name, '/', 1) = auth_dealer_id()::text or is_admin())
  );

drop policy if exists dealer_logos_delete on storage.objects;
create policy dealer_logos_delete on storage.objects
  for delete using (
    bucket_id = 'dealer-logos'
    and (split_part(name, '/', 1) = auth_dealer_id()::text or is_admin())
  );
