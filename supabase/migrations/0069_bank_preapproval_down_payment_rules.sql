-- Bank pre-approval terms need to distinguish:
-- 1) maximum amount the bank will finance,
-- 2) fixed minimum down payment,
-- 3) percentage minimum down payment,
-- 4) whether the monthly payment was auto-estimated or manually supplied.

alter table public.application_banks
  add column if not exists down_required_pct numeric,
  add column if not exists down_rule text,
  add column if not exists monthly_manual boolean not null default false;

comment on column public.application_banks.down_required_pct is
  'Minimum down payment percentage for pre-approvals. The actual down payment is calculated once a vehicle price exists.';
comment on column public.application_banks.down_rule is
  'Human-readable down payment rule, e.g. use the greater of RD$250,000 and 20% of vehicle price.';
comment on column public.application_banks.monthly_manual is
  'True when a bank manually supplied monthly instead of using AutoRD estimated amortization.';

create or replace function private.package_terms_hash(p_response_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(
      coalesce(ab.status::text,'')            || '|' ||
      coalesce(ab.approved_amount::text,'')   || '|' ||
      coalesce(ab.apr::text,'')               || '|' ||
      coalesce(ab.term_years::text,'')        || '|' ||
      coalesce(ab.monthly::text,'')           || '|' ||
      coalesce(ab.monthly_manual::text,'')    || '|' ||
      coalesce(ab.down_required::text,'')     || '|' ||
      coalesce(ab.down_required_pct::text,'') || '|' ||
      coalesce(ab.down_rule,'')               || '|' ||
      coalesce(ab.valid_until::text,'')       || '|' ||
      coalesce(ab.notes,'')                   || '|' ||
      ab.id::text, 'UTF8')), 'hex')
  from public.application_banks ab where ab.id = p_response_id;
$$;

create or replace function public.get_financing_by_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.financing_public_tokens; fa public.financing_applications; result jsonb;
begin
  select * into t from public.financing_public_tokens where token = p_token;
  if t.token is null then return jsonb_build_object('authorized', false, 'reason', 'not_found'); end if;
  if t.revoked or t.expires_at < now() then return jsonb_build_object('authorized', false, 'reason', 'expired'); end if;
  if t.cedula_verified_at is null or t.otp_verified_at is null then
    return jsonb_build_object('authorized', false, 'reason', 'unverified');
  end if;
  select * into fa from public.financing_applications where id = t.application_id;
  select jsonb_build_object(
    'authorized', true, 'applicationId', fa.id, 'code', fa.code, 'createdAt', fa.created_at,
    'isPreapproval', (fa.vehicle_id is null), 'kycStatus', fa.kyc_status::text, 'consentSigned', fa.consent_signed,
    'vehicleLinkedAt', fa.vehicle_linked_at, 'requestedAmount', fa.requested_amount, 'down', fa.down_payment,
    'term', fa.term_years, 'customerName', fa.buyer_name,
    'clientAcceptedAt', fa.client_accepted_at, 'reservedUntil', fa.reserved_until,
    'selectedBankSlug', (select b.slug from public.banks b where b.id = fa.selected_bank_id),
    'dealerName', d.name, 'dealerWhatsapp', d.whatsapp,
    'vehicle', case when v.id is not null then jsonb_build_object('id', v.id, 'slug', v.slug, 'make', v.make,
        'model', v.model, 'year', v.year, 'price', v.price, 'dealer', d.name) else null end,
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bankName', bb.name, 'bankSlug', bb.slug, 'bankColor', bb.color, 'bankInitials', bb.initials,
        'status', ab.status::text, 'apr', ab.apr, 'term', ab.term_years, 'monthly', ab.monthly,
        'monthlyManual', ab.monthly_manual,
        'down', ab.down_required, 'downPct', ab.down_required_pct, 'downRule', ab.down_rule,
        'approvedAmount', ab.approved_amount, 'validUntil', ab.valid_until,
        'notes', ab.notes, 'respondedAt', ab.responded_at, 'selected', ab.selected) order by ab.responded_at desc nulls last)
      from public.application_banks ab join public.banks bb on bb.id = ab.bank_id where ab.application_id = fa.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('actor', e.actor, 'kind', e.kind, 'detail', e.detail, 'at', e.created_at)
        order by e.created_at desc)
      from public.financing_events e where e.application_id = fa.id
    ), '[]'::jsonb)
  ) into result
  from public.financing_applications x
  left join public.vehicles v on v.id = fa.vehicle_id
  left join public.dealers d on d.id = fa.dealer_id
  where x.id = fa.id;
  return result;
end $$;
grant execute on function public.get_financing_by_token(uuid) to anon, authenticated;

create or replace function public.get_public_financing_contract(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a public.financing_applications; v public.vehicles; d public.dealers;
  fin public.application_financials; b text[]; bd jsonb;
  v_bank uuid; v_scoped boolean := false; v_accepted timestamptz;
begin
  select * into a from public.financing_applications where contract_token = p_token;
  if a.id is null then return null; end if;
  select * into v from public.vehicles where id = a.vehicle_id;
  select * into d from public.dealers where id = a.dealer_id;
  select * into fin from public.application_financials where application_id = a.id;

  v_bank := public.auth_bank_id();
  if v_bank is not null and exists (
    select 1 from public.application_banks ab
    where ab.application_id = a.id and ab.bank_id = v_bank
  ) then v_scoped := true; else v_bank := null; end if;

  select max(accepted_at) into v_accepted
  from public.financing_bank_consents where application_id = a.id;

  select array_agg(bk.name order by bk.name) into b
  from public.application_banks ab join public.banks bk on bk.id = ab.bank_id
  where ab.application_id = a.id and (not v_scoped or ab.bank_id = v_bank);

  select jsonb_agg(jsonb_build_object(
    'slug', bk.slug, 'name', bk.name, 'color', bk.color, 'initials', bk.initials,
    'status', ab.status::text, 'apr', ab.apr, 'term', ab.term_years,
    'monthly', ab.monthly, 'monthlyManual', ab.monthly_manual,
    'down', ab.down_required, 'downPct', ab.down_required_pct, 'downRule', ab.down_rule,
    'approvedAmount', ab.approved_amount, 'validUntil', ab.valid_until,
    'respondedAt', ab.responded_at, 'notes', ab.notes,
    'selected', ab.selected,
    'signedAt', bc.signed_at, 'consentHash', bc.consent_hash, 'consentVersion', bc.consent_version,
    'acceptedAt', bc.accepted_at, 'acceptedVia', bc.accepted_via
  ) order by bk.name) into bd
  from public.application_banks ab
  join public.banks bk on bk.id = ab.bank_id
  left join public.financing_bank_consents bc on bc.application_id = a.id and bc.bank_id = ab.bank_id
  where ab.application_id = a.id and (not v_scoped or ab.bank_id = v_bank);

  return jsonb_build_object(
    'code', a.code, 'created_at', a.created_at, 'consent_at', a.consent_signed_at,
    'hash', a.contract_hash, 'version', a.contract_version,
    'customer', a.buyer_name, 'phone', a.buyer_phone, 'email', a.buyer_email,
    'cedula_masked', fin.cedula_masked, 'kyc_status', a.kyc_status,
    'is_preapproval', a.vehicle_id is null,
    'vehicle', case when v.id is not null then (v.make || ' ' || v.model || ' ' || v.year) else null end,
    'dealer', d.name, 'amount', a.requested_amount, 'down', a.down_payment, 'term', a.term_years,
    'banks', coalesce(b, array[]::text[]),
    'bank_details', coalesce(bd, '[]'::jsonb),
    'scoped_to_bank', v_scoped,
    'accepted_at', v_accepted
  );
end $$;
grant execute on function public.get_public_financing_contract(uuid) to anon, authenticated;
