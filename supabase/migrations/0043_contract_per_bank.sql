-- ============================================================
-- AutoRD — per-bank consent contracts
-- The consent contract used to name every routed bank in one blanket document.
-- Each bank now gets its OWN contract (its logo/brand + the terms IT offered),
-- so "Ver contrato" next to BHD opens the BHD consent, not a shared one.
-- Adds bank_details[] to the public contract payload; the page picks one via
-- /contrato/:token?banco=<slug>.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================
create or replace function public.get_public_financing_contract(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a public.financing_applications; v public.vehicles; d public.dealers;
  fin public.application_financials; b text[]; bd jsonb;
begin
  select * into a from public.financing_applications where contract_token = p_token;
  if a.id is null then return null; end if;
  select * into v from public.vehicles where id = a.vehicle_id;
  select * into d from public.dealers where id = a.dealer_id;
  select * into fin from public.application_financials where application_id = a.id;

  select array_agg(bk.name order by bk.name) into b
  from public.application_banks ab join public.banks bk on bk.id = ab.bank_id
  where ab.application_id = a.id;

  -- Per-bank consent detail: brand + the terms that bank actually responded with.
  select jsonb_agg(jsonb_build_object(
    'slug', bk.slug, 'name', bk.name, 'color', bk.color, 'initials', bk.initials,
    'status', ab.status::text, 'apr', ab.apr, 'term', ab.term_years,
    'monthly', ab.monthly, 'down', ab.down_required,
    'approvedAmount', ab.approved_amount, 'validUntil', ab.valid_until,
    'respondedAt', ab.responded_at, 'notes', ab.notes,
    'selected', ab.selected
  ) order by bk.name) into bd
  from public.application_banks ab join public.banks bk on bk.id = ab.bank_id
  where ab.application_id = a.id;

  return jsonb_build_object(
    'code', a.code, 'created_at', a.created_at, 'consent_at', a.consent_signed_at,
    'hash', a.contract_hash, 'version', a.contract_version,
    'customer', a.buyer_name, 'phone', a.buyer_phone, 'email', a.buyer_email,
    'cedula_masked', fin.cedula_masked, 'kyc_status', a.kyc_status,
    'is_preapproval', a.vehicle_id is null,
    'vehicle', case when v.id is not null then (v.make || ' ' || v.model || ' ' || v.year) else null end,
    'dealer', d.name, 'amount', a.requested_amount, 'down', a.down_payment, 'term', a.term_years,
    'banks', coalesce(b, array[]::text[]),
    'bank_details', coalesce(bd, '[]'::jsonb)
  );
end $$;
grant execute on function public.get_public_financing_contract(uuid) to anon, authenticated;
