-- ============================================================
-- AutoRD — one acceptance, a signature per bank
-- The client accepts the terms ONCE; AutoRD then issues an individually
-- timestamped and hashed consent record for EACH routed bank, so every bank
-- holds its own evidence that it was authorized to pull credit — instead of a
-- single blanket consent_signed_at on the application.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create table if not exists public.financing_bank_consents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  bank_id uuid not null references public.banks(id) on delete cascade,
  signed_at timestamptz not null default now(),
  consent_version text not null default 'v1',
  consent_hash text,
  created_at timestamptz not null default now(),
  unique (application_id, bank_id)
);
create index if not exists idx_bank_consents_app on public.financing_bank_consents(application_id);
alter table public.financing_bank_consents enable row level security;

-- Credit consent is between the client and THAT bank: the buyer, the bank it was
-- issued to, and admins can read it. Dealers cannot (same rule as financials).
drop policy if exists bank_consents_read on public.financing_bank_consents;
create policy bank_consents_read on public.financing_bank_consents for select to authenticated using (
  public.is_admin()
  or bank_id = public.auth_bank_id()
  or exists (select 1 from public.financing_applications fa where fa.id = application_id and fa.buyer_id = auth.uid())
);

-- ---- Issue the per-bank signatures from a single acceptance ----------------
create or replace function public.sign_financing_consents(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.financing_applications; v_at timestamptz; v_count int;
begin
  select * into a from public.financing_applications where id = p_application_id;
  if a.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not (a.buyer_id = auth.uid() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  v_at := coalesce(a.consent_signed_at, now());

  -- One consent row per routed bank, each hashed over its own bank identity so
  -- the documents are individually verifiable and not interchangeable.
  insert into public.financing_bank_consents (application_id, bank_id, signed_at, consent_hash)
  select a.id, ab.bank_id, v_at,
    encode(extensions.digest(
      coalesce(a.code,'') || '|' || bk.slug || '|' || coalesce(a.buyer_name,'') || '|' ||
      coalesce(a.requested_amount::text,'') || '|' || v_at::text || '|' || coalesce(a.consent_text,''),
      'sha256'), 'hex')
  from public.application_banks ab join public.banks bk on bk.id = ab.bank_id
  where ab.application_id = a.id
  on conflict (application_id, bank_id) do nothing;
  get diagnostics v_count = row_count;

  update public.financing_applications
     set consent_signed = true, consent_signed_at = v_at
   where id = a.id and consent_signed_at is null;

  if v_count > 0 then
    insert into public.financing_events (application_id, actor, kind, detail, meta)
    values (a.id, 'cliente', 'consent', 'Autorización firmada para ' || v_count || ' banco(s)',
      jsonb_build_object('banks', v_count));
  end if;

  return jsonb_build_object('ok', true, 'signed', v_count);
end $$;
grant execute on function public.sign_financing_consents(uuid) to authenticated;

-- ---- Backfill: existing signed applications get their per-bank records ------
insert into public.financing_bank_consents (application_id, bank_id, signed_at, consent_hash)
select fa.id, ab.bank_id, coalesce(fa.consent_signed_at, fa.created_at),
  encode(extensions.digest(
    coalesce(fa.code,'') || '|' || bk.slug || '|' || coalesce(fa.buyer_name,'') || '|' ||
    coalesce(fa.requested_amount::text,'') || '|' || coalesce(fa.consent_signed_at, fa.created_at)::text || '|' ||
    coalesce(fa.consent_text,''), 'sha256'), 'hex')
from public.financing_applications fa
join public.application_banks ab on ab.application_id = fa.id
join public.banks bk on bk.id = ab.bank_id
where fa.consent_signed
on conflict (application_id, bank_id) do nothing;

-- ---- Surface each bank's own signature on its contract ---------------------
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

  select jsonb_agg(jsonb_build_object(
    'slug', bk.slug, 'name', bk.name, 'color', bk.color, 'initials', bk.initials,
    'status', ab.status::text, 'apr', ab.apr, 'term', ab.term_years,
    'monthly', ab.monthly, 'down', ab.down_required,
    'approvedAmount', ab.approved_amount, 'validUntil', ab.valid_until,
    'respondedAt', ab.responded_at, 'notes', ab.notes,
    'selected', ab.selected,
    'signedAt', bc.signed_at, 'consentHash', bc.consent_hash, 'consentVersion', bc.consent_version
  ) order by bk.name) into bd
  from public.application_banks ab
  join public.banks bk on bk.id = ab.bank_id
  left join public.financing_bank_consents bc on bc.application_id = a.id and bc.bank_id = ab.bank_id
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
