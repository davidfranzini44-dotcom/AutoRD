-- ============================================================
-- AutoRD — the customer's explicit acceptance of the contract
-- Until now consent was INFERRED from finishing the wizard: the application was
-- stamped consent_signed and per-bank consents were issued (0044). What was
-- missing is the customer's own affirmative act against a specific document —
-- "I read this and I accept it", timestamped, tied to the contract version shown.
--
-- Deliberately NOT a drawn signature: a canvas scribble adds theatre, not
-- evidence. What stands up is the chain already in place — Didit-verified
-- identity, a WhatsApp-verified number, a per-bank SHA-256 consent hash — plus
-- this affirmative act recorded against the exact contract hash on screen.
--
-- One acceptance covers every routed bank (each keeps its own row and its own
-- hash), matching how the signatures are issued.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

alter table public.financing_bank_consents
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references public.profiles(id),
  add column if not exists accepted_via text,          -- 'cuenta' | 'enlace'
  add column if not exists accepted_user_agent text,
  add column if not exists accepted_contract_hash text;

-- Who may accept:
--   * the buyer, signed in (auth.uid() = buyer_id); or
--   * someone holding a FULLY VERIFIED portal token for that application —
--     i.e. they passed the last-4 cédula AND the WhatsApp OTP. Holding the
--     contract link alone is NOT enough to accept on someone's behalf.
create or replace function public.accept_contract_terms(
  p_contract_token uuid,
  p_portal_token uuid default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.financing_applications; t public.financing_public_tokens;
  v_via text; v_by uuid; n int;
begin
  select * into a from public.financing_applications where contract_token = p_contract_token;
  if a.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if auth.uid() is not null and a.buyer_id = auth.uid() then
    v_via := 'cuenta'; v_by := auth.uid();
  elsif p_portal_token is not null then
    select * into t from public.financing_public_tokens where token = p_portal_token;
    if t.token is null or t.application_id <> a.id
       or t.revoked or t.expires_at < now()
       or t.cedula_verified_at is null or t.otp_verified_at is null then
      return jsonb_build_object('ok', false, 'reason', 'not_verified');
    end if;
    v_via := 'enlace'; v_by := t.verified_profile_id;
  else
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  -- Idempotent: accepting twice keeps the first acceptance.
  update public.financing_bank_consents
     set accepted_at = now(),
         accepted_by = v_by,
         accepted_via = v_via,
         accepted_user_agent = left(coalesce(p_user_agent, ''), 400),
         accepted_contract_hash = a.contract_hash
   where application_id = a.id and accepted_at is null;
  get diagnostics n = row_count;

  if n > 0 then
    insert into public.financing_events (application_id, actor, kind, detail, meta)
    values (a.id, 'cliente', 'terms_accepted',
            'Aceptó los términos para ' || n || ' banco(s)',
            jsonb_build_object('via', v_via, 'banks', n, 'contractHash', a.contract_hash));
  end if;

  return jsonb_build_object('ok', true, 'accepted', n);
end $$;
grant execute on function public.accept_contract_terms(uuid, uuid, text) to anon, authenticated;

-- Surface acceptance on the contract payload (respects the per-bank scoping).
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
    'monthly', ab.monthly, 'down', ab.down_required,
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
