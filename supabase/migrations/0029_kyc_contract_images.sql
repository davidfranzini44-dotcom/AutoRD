-- ============================================================
-- AutoRD 0029 — KYC identity images on the sealed contract
-- The customer's cédula image + prueba-de-vida (liveness) selfie are captured
-- by DIDIT and stored PRIVATELY. They are NEVER served from the public/anon
-- contract endpoint. Only the buyer (owner), a bank assigned to one of the
-- buyer's applications, and AutoRD admins can read them (storage RLS below),
-- and the paths are handed out only through get_contract_identity() with the
-- same authorization. Anyone else keeps seeing the masked contract.
-- ============================================================

-- 1. Where the private image paths live (never the images themselves in SQL).
alter table public.kyc_verifications
  add column if not exists id_image_path text,
  add column if not exists liveness_image_path text,
  add column if not exists images_captured_at timestamptz;

-- 2. Private bucket. public=false => no anonymous access; only RLS-passing
--    authenticated reads and the service role (webhook) can touch objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-images',
  'kyc-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3. Objects are keyed by the buyer's profile id: "<profile_id>/id.jpg" etc.
--    This helper pulls that id out of the object path for the RLS policy.
create or replace function public.kyc_image_profile_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, storage
as $$
declare
  first_folder text;
begin
  first_folder := (storage.foldername(object_name))[1];
  if first_folder is null
     or first_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return first_folder::uuid;
end;
$$;

revoke all on function public.kyc_image_profile_id(text) from public;
grant execute on function public.kyc_image_profile_id(text) to authenticated, service_role;

-- 4. Read policy: the owner, a bank evaluating one of the owner's applications,
--    or an admin. No insert/update/delete policy for `authenticated` — writes
--    happen only via the service role in the didit-webhook.
drop policy if exists kyc_images_read on storage.objects;
create policy kyc_images_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'kyc-images'
  and (
    public.kyc_image_profile_id(name) = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.financing_applications fa
      join public.application_banks ab on ab.application_id = fa.id
      where fa.buyer_id = public.kyc_image_profile_id(name)
        and ab.bank_id = public.auth_bank_id()
    )
  )
);

-- 5. Authenticated resolver: token -> (is the caller allowed? which paths?).
--    Returns { authorized:false } for anyone who isn't the buyer / assigned
--    bank / admin, so the front-end can keep the contract masked for them.
--    Returns the private storage paths (not URLs) for authorized callers; the
--    client then mints a short-lived signed URL, which storage RLS re-checks.
create or replace function public.get_contract_identity(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.financing_applications;
  k public.kyc_verifications;
  authorized boolean;
begin
  select * into a from public.financing_applications where contract_token = p_token;
  if a.id is null then
    return null;
  end if;

  authorized := (a.buyer_id = auth.uid()) or public.bank_on_app(a.id) or public.is_admin();
  if not authorized then
    return jsonb_build_object('authorized', false);
  end if;

  select * into k
  from public.kyc_verifications
  where profile_id = a.buyer_id
    and status = 'aprobado'
  order by coalesce(images_captured_at, updated_at, created_at) desc nulls last
  limit 1;

  return jsonb_build_object(
    'authorized', true,
    'id_image_path', k.id_image_path,
    'liveness_image_path', k.liveness_image_path,
    'captured_at', k.images_captured_at
  );
end;
$$;

revoke all on function public.get_contract_identity(uuid) from public;
grant execute on function public.get_contract_identity(uuid) to authenticated;

notify pgrst, 'reload schema';
