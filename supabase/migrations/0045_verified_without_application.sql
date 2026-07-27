-- ============================================================
-- AutoRD — "Verificados sin solicitud"
-- A buyer who completes KYC but abandons the wizard before the final
-- "Enviar solicitud a bancos" step leaves NO application, so nobody ever sees
-- them — even though they are the highest-intent lead there is (they
-- photographed their cédula and passed a liveness check).
--
-- This RPC surfaces exactly those people for the platform operator so they can
-- be nudged. Admin-only: these are verified identities with no application, so
-- there is no dealer or bank yet with a legitimate claim to the data.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================
create or replace function public.get_verified_without_application()
returns table (
  profile_id uuid,
  name text,
  phone text,
  phone_verified boolean,
  kyc_verified_at timestamptz,
  kyc_status text,
  graced boolean,
  days_since numeric
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    -- profiles.full_name is often blank for a WhatsApp-only account; fall back to
    -- the name Didit read off the cédula so the list is actually actionable.
    nullif(trim(coalesce(nullif(p.full_name, ''),
      (select k.decision->'decision'->'id_verification'->>'full_name'
         from public.kyc_verifications k
        where k.profile_id = p.id and k.status = 'aprobado'
        order by k.updated_at desc nulls last limit 1))), '') as name,
    p.phone,
    p.phone_verified_at is not null,
    p.kyc_verified_at,
    (select k.status::text from public.kyc_verifications k
      where k.profile_id = p.id order by k.updated_at desc nulls last limit 1),
    -- graced = passed under the DR expired-cédula rule rather than a clean pass
    coalesce((select k.didit_status ilike '%gracia%' from public.kyc_verifications k
      where k.profile_id = p.id and k.status = 'aprobado'
      order by k.updated_at desc nulls last limit 1), false),
    round(extract(epoch from (now() - p.kyc_verified_at)) / 86400.0, 1)
  from public.profiles p
  where public.is_admin()
    and p.kyc_verified_at is not null
    and p.role = 'buyer'
    and not exists (select 1 from public.financing_applications fa where fa.buyer_id = p.id)
  order by p.kyc_verified_at desc;
$$;
grant execute on function public.get_verified_without_application() to authenticated;
