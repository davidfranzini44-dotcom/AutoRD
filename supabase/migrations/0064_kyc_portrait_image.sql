-- Applied live via Supabase MCP; kept here for repo parity.
--
-- The face cropped from the ID document. DIDIT returns it as `portrait_image`,
-- separate from `front_image` (the whole cedula) and from the liveness selfie.
-- captureIdentityImages folds portrait_image in as a FALLBACK for the front
-- image, so it was never stored in its own right and the panel could only ever
-- show the entire document.
alter table public.kyc_verifications
  add column if not exists portrait_image_path text;

create or replace function public.get_contract_identity(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a public.financing_applications;
  k public.kyc_verifications;
  authorized boolean;
  v_portrait_fallback text;
begin
  if auth.uid() is null then
    return jsonb_build_object('authorized', false);
  end if;

  select * into a from public.financing_applications where contract_token = p_token;
  if a.id is null then return null; end if;

  authorized := coalesce(
    (a.buyer_id = auth.uid()) or public.bank_on_app(a.id) or public.is_admin(),
    false
  );
  if not authorized then
    return jsonb_build_object('authorized', false);
  end if;

  select * into k
  from public.kyc_verifications
  where profile_id = a.buyer_id and status = 'aprobado'
  order by coalesce(images_captured_at, updated_at, created_at) desc nulls last
  limit 1;

  -- Bridge for verifications captured before portrait_image_path existed: read
  -- the portrait straight out of the stored DIDIT decision. That is a PRESIGNED
  -- S3 link and it WILL expire, so it is only a fallback and only used when we
  -- have not copied the image into our own bucket yet. Once the webhook stores
  -- portrait_image_path, that wins and this is never consulted.
  if k.portrait_image_path is null then
    v_portrait_fallback := coalesce(
      k.decision->'decision'->'id_verification'->>'portrait_image',
      k.decision->'id_verification'->>'portrait_image'
    );
  end if;

  return jsonb_build_object(
    'authorized', true,
    'id_image_path', k.id_image_path,
    'liveness_image_path', k.liveness_image_path,
    'portrait_image_path', k.portrait_image_path,
    'portrait_fallback_url', v_portrait_fallback,
    'captured_at', k.images_captured_at
  );
end; $$;
