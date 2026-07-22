-- Sealed, DIDIT-verified financing consent contract (KYC/data + credit-consultation authorization).
alter table financing_applications add column if not exists contract_token uuid not null default gen_random_uuid();
alter table financing_applications add column if not exists contract_hash text;
alter table financing_applications add column if not exists contract_version text not null default 'v1.0';
create unique index if not exists financing_applications_contract_token_idx on financing_applications(contract_token);

-- Seal the contract for the caller's own application (compute a tamper-evident hash).
create or replace function seal_financing_contract(p_application uuid)
returns table(token uuid, hash text) language plpgsql security definer set search_path to 'public' as $$
declare a public.financing_applications; h text;
begin
  select * into a from public.financing_applications where id = p_application and (buyer_id = auth.uid() or is_admin());
  if a.id is null then raise exception 'not_found'; end if;
  h := encode(sha256(convert_to(
        coalesce(a.code,'') || '|' || coalesce(a.buyer_name,'') || '|' || coalesce(a.requested_amount::text,'') || '|' ||
        coalesce(a.consent_signed_at::text,'') || '|' || a.id::text, 'UTF8')), 'hex');
  update public.financing_applications set contract_hash = h where id = a.id;
  return query select a.contract_token, h;
end $$;
grant execute on function seal_financing_contract(uuid) to authenticated, anon;

-- Public read of a sealed contract by its token (no auth; token is the capability).
-- Exposes only masked cédula + the application's own data; never biometrics or other apps.
create or replace function get_public_financing_contract(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare a public.financing_applications; v public.vehicles; d public.dealers; fin public.application_financials; b text[];
begin
  select * into a from public.financing_applications where contract_token = p_token;
  if a.id is null then return null; end if;
  select * into v from public.vehicles where id = a.vehicle_id;
  select * into d from public.dealers where id = a.dealer_id;
  select * into fin from public.application_financials where application_id = a.id;
  select array_agg(bk.name order by bk.name) into b from public.application_banks ab join public.banks bk on bk.id = ab.bank_id where ab.application_id = a.id;
  return jsonb_build_object(
    'code', a.code, 'created_at', a.created_at, 'consent_at', a.consent_signed_at,
    'hash', a.contract_hash, 'version', a.contract_version,
    'customer', a.buyer_name, 'phone', a.buyer_phone, 'email', a.buyer_email,
    'cedula_masked', fin.cedula_masked, 'kyc_status', a.kyc_status,
    'is_preapproval', a.vehicle_id is null,
    'vehicle', case when v.id is not null then (v.make || ' ' || v.model || ' ' || v.year) else null end,
    'dealer', d.name, 'amount', a.requested_amount, 'down', a.down_payment, 'term', a.term_years,
    'banks', coalesce(b, array[]::text[])
  );
end $$;
grant execute on function get_public_financing_contract(uuid) to anon, authenticated;
