-- ============================================================
-- AutoRD documents workflow
-- Banks request supporting documents; buyers upload them privately.
-- ============================================================

alter table public.documents
  add column if not exists notes text,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists uploaded_at timestamptz,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint;

create index if not exists idx_documents_app_created
  on public.documents (application_id, created_at desc);

grant select, insert, update on public.documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.document_storage_application_id(object_name text)
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

revoke all on function public.document_storage_application_id(text) from public;
grant execute on function public.document_storage_application_id(text) to authenticated, service_role;

drop policy if exists application_documents_read on storage.objects;
drop policy if exists application_documents_upload on storage.objects;
drop policy if exists application_documents_update on storage.objects;

create policy application_documents_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'application-documents'
  and (
    public.is_app_owner(public.document_storage_application_id(name))
    or exists (
      select 1
      from public.documents d
      where d.storage_path = name
        and d.requested_by_bank = public.auth_bank_id()
    )
    or public.is_admin()
  )
);

create policy application_documents_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'application-documents'
  and (
    public.is_app_owner(public.document_storage_application_id(name))
    or public.is_admin()
  )
);

create policy application_documents_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'application-documents'
  and (
    public.is_app_owner(public.document_storage_application_id(name))
    or public.is_admin()
  )
)
with check (
  bucket_id = 'application-documents'
  and (
    public.is_app_owner(public.document_storage_application_id(name))
    or public.is_admin()
  )
);
