-- ============================================================
-- AutoRD 0030 — harden get_contract_identity() authorization
-- Bug: for an anonymous caller auth.uid() is NULL, so
--   (a.buyer_id = auth.uid())  ->  NULL
--   NULL or false or false     ->  NULL
--   if not NULL                ->  NULL (branch skipped)
-- ...which let the function fall through and report authorized:true (with null
-- paths). The image bytes were still protected by storage RLS (authenticated-
-- only), but the resolver itself must never authorize an anonymous caller.
-- Fix: reject null-uid up front and coalesce the authorization to a real bool.
-- ============================================================

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
  -- Anonymous callers are never authorized.
  if auth.uid() is null then
    return jsonb_build_object('authorized', false);
  end if;

  select * into a from public.financing_applications where contract_token = p_token;
  if a.id is null then
    return null;
  end if;

  authorized := coalesce(
    (a.buyer_id = auth.uid()) or public.bank_on_app(a.id) or public.is_admin(),
    false
  );
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

revoke all on function public.get_contract_identity(uuid) from public, anon;
grant execute on function public.get_contract_identity(uuid) to authenticated;

notify pgrst, 'reload schema';
