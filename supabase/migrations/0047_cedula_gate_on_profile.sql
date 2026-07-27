-- ============================================================
-- AutoRD — fix the client-portal cédula gate for real customers
-- The last-4 hash was written onto APPLICATIONS when KYC was approved, but in
-- the wizard KYC always happens BEFORE the application exists — so no real
-- application ever carried it and /f/:token rejected its own customers with
-- "no_cedula_on_file".
--
-- The identity belongs to the person, not the application: store the hash on the
-- profile, keep writing it to applications when they exist, and let the gate
-- fall back to the profile. Backfilled from the document number Didit already
-- captured in each approved decision.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

alter table public.profiles add column if not exists cedula_last4_hash text;

-- Capture on the person AND on any existing applications.
create or replace function public.set_application_cedula(p_buyer_id uuid, p_last4 text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if p_buyer_id is null or p_last4 is null or p_last4 !~ '^[0-9]{4}$' then return; end if;

  update public.profiles set cedula_last4_hash = private.hash_last4(p_last4) where id = p_buyer_id;

  update public.application_financials af
    set cedula_last4_hash = private.hash_last4(p_last4)
  from public.financing_applications fa
  where af.application_id = fa.id and fa.buyer_id = p_buyer_id;
end $$;
revoke all on function public.set_application_cedula(uuid, text) from public, anon, authenticated;
grant execute on function public.set_application_cedula(uuid, text) to service_role;

-- Gate: accept the application's own hash, else the buyer's profile hash.
create or replace function public.verify_financing_cedula(p_token uuid, p_last4 text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare t public.financing_public_tokens; v_hash text;
begin
  select * into t from public.financing_public_tokens where token = p_token;
  if t.token is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.revoked or t.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if t.cedula_verified_at is not null then return jsonb_build_object('ok', true); end if;
  if t.cedula_attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if p_last4 is null or p_last4 !~ '^[0-9]{4}$' then
    update public.financing_public_tokens set cedula_attempts = cedula_attempts + 1 where token = p_token;
    return jsonb_build_object('ok', false, 'reason', 'bad_format', 'attemptsLeft', 4 - t.cedula_attempts);
  end if;

  select coalesce(af.cedula_last4_hash, p.cedula_last4_hash) into v_hash
  from public.financing_applications fa
  left join public.application_financials af on af.application_id = fa.id
  left join public.profiles p on p.id = fa.buyer_id
  where fa.id = t.application_id;

  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'no_cedula_on_file'); end if;

  if v_hash = private.hash_last4(p_last4) then
    update public.financing_public_tokens set cedula_verified_at = now() where token = p_token;
    return jsonb_build_object('ok', true);
  else
    update public.financing_public_tokens set cedula_attempts = cedula_attempts + 1 where token = p_token;
    return jsonb_build_object('ok', false, 'reason', 'mismatch', 'attemptsLeft', 4 - t.cedula_attempts);
  end if;
end $$;
grant execute on function public.verify_financing_cedula(uuid, text) to anon, authenticated;

-- Backfill every verified person from the document number already on file.
with src as (
  select distinct on (k.profile_id)
    k.profile_id,
    right(regexp_replace(coalesce(
      k.decision->'decision'->'id_verification'->>'document_number',
      k.decision->'decision'->'id_verification'->>'personal_number',
      k.decision->'decision'->'id_verifications'->0->>'document_number',
      k.decision->'id_verification'->>'document_number'
    ), '[^0-9]', '', 'g'), 4) as last4
  from public.kyc_verifications k
  where k.status = 'aprobado'
  order by k.profile_id, k.updated_at desc nulls last
)
update public.profiles p
set cedula_last4_hash = private.hash_last4(src.last4)
from src
where p.id = src.profile_id and src.last4 ~ '^[0-9]{4}$' and p.cedula_last4_hash is null;

-- ...and onto their applications, so the bank-side file is consistent too.
update public.application_financials af
set cedula_last4_hash = p.cedula_last4_hash
from public.financing_applications fa join public.profiles p on p.id = fa.buyer_id
where af.application_id = fa.id and af.cedula_last4_hash is null and p.cedula_last4_hash is not null;
