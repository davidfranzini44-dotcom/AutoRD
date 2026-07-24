-- ============================================================
-- AutoRD — client-facing financing portal (Phase 1)
-- Secure public link /f/:token with progressive identity verification:
--   token preview (masked) -> last-4 cédula -> WhatsApp OTP -> full reveal.
--
-- Security model (mirrors the /contrato/:token pattern):
--   * A random unguessable token scoped to ONE application, with expiry +
--     per-token attempt counters. RLS denies ALL direct access; everything
--     goes through SECURITY DEFINER RPCs.
--   * Sensitive detail (amounts, apr, offers) is returned ONLY after BOTH the
--     last-4 cédula AND the WhatsApp OTP have been verified for the token.
--   * The last-4 cédula is stored ONLY as a peppered HMAC. The pepper lives in
--     a private, deny-all table so a leak of application_financials can't
--     brute-force 4 digits offline.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create extension if not exists pgcrypto;

-- ---- Private pepper (never exposed via PostgREST; only SECURITY DEFINER fns) --
create schema if not exists private;
create table if not exists private.secrets (
  name text primary key,
  value text not null
);
alter table private.secrets enable row level security; -- no policies => deny all
insert into private.secrets (name, value)
  values ('cedula_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (name) do nothing;

create or replace function private.hash_last4(p_last4 text)
returns text language sql stable security definer set search_path = private, public, extensions as $$
  select encode(extensions.hmac(p_last4, (select value from private.secrets where name = 'cedula_pepper'), 'sha256'), 'hex');
$$;

-- ---- Captured last-4 cédula hash on the application's financials ------------
alter table public.application_financials
  add column if not exists cedula_last4_hash text;

-- ---- Public tokens ---------------------------------------------------------
create table if not exists public.financing_public_tokens (
  token uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  cedula_attempts int not null default 0,
  cedula_verified_at timestamptz,
  otp_verified_at timestamptz,
  verified_profile_id uuid references public.profiles(id),
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_fin_tokens_app on public.financing_public_tokens(application_id);
alter table public.financing_public_tokens enable row level security; -- deny all direct; RPCs only

-- ---- Capture: store the last-4 hash for a buyer's applications --------------
-- Called by the Didit webhook (service role) once identity is verified.
create or replace function public.set_application_cedula(p_buyer_id uuid, p_last4 text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if p_buyer_id is null or p_last4 is null or p_last4 !~ '^[0-9]{4}$' then return; end if;
  update public.application_financials af
    set cedula_last4_hash = private.hash_last4(p_last4)
  from public.financing_applications fa
  where af.application_id = fa.id and fa.buyer_id = p_buyer_id;
end $$;
revoke all on function public.set_application_cedula(uuid, text) from public, anon, authenticated;
grant execute on function public.set_application_cedula(uuid, text) to service_role;

-- ---- Get-or-create a token for an application ------------------------------
-- Bank routed on the app, the app's dealer, the buyer, or admin may mint it.
create or replace function public.get_or_create_financing_token(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if not exists (
    select 1 from public.financing_applications fa where fa.id = p_application_id and (
      fa.buyer_id = auth.uid()
      or fa.dealer_id = public.auth_dealer_id()
      or public.is_admin()
      or exists (select 1 from public.application_banks ab where ab.application_id = fa.id and ab.bank_id = public.auth_bank_id())
    )
  ) then
    raise exception 'not authorized';
  end if;

  select token into v_token
  from public.financing_public_tokens
  where application_id = p_application_id and not revoked and expires_at > now()
  order by created_at desc limit 1;

  if v_token is null then
    insert into public.financing_public_tokens (application_id)
    values (p_application_id) returning token into v_token;
  end if;
  return v_token;
end $$;
grant execute on function public.get_or_create_financing_token(uuid) to authenticated;

-- ---- Masked public preview (no sensitive financials) -----------------------
create or replace function public.get_financing_public_preview(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when t.token is null then jsonb_build_object('found', false) else
    jsonb_build_object(
      'found', true,
      'expired', (t.expires_at < now() or t.revoked),
      'cedulaVerified', t.cedula_verified_at is not null,
      'otpVerified', t.otp_verified_at is not null,
      'cedulaLocked', t.cedula_attempts >= 5,
      'hasCedulaOnFile', (af.cedula_last4_hash is not null),
      'customerFirstName', split_part(coalesce(fa.buyer_name, ''), ' ', 1),
      'phoneHint', right(regexp_replace(coalesce(fa.buyer_phone, ''), '[^0-9]', '', 'g'), 4),
      'status', best.status,
      'bankName', b.name, 'bankSlug', b.slug, 'bankColor', b.color, 'bankInitials', b.initials,
      'dealerName', d.name,
      'vehicle', case when v.id is not null then trim(v.make || ' ' || v.model || ' ' || v.year::text) else null end
    ) end
  from (select p_token as token) q
  left join public.financing_public_tokens t on t.token = q.token
  left join public.financing_applications fa on fa.id = t.application_id
  left join public.application_financials af on af.application_id = fa.id
  left join public.dealers d on d.id = fa.dealer_id
  left join public.vehicles v on v.id = fa.vehicle_id
  left join lateral (
    select ab.status::text as status, ab.bank_id
    from public.application_banks ab
    where ab.application_id = fa.id
    order by ab.responded_at desc nulls last, ab.created_at desc limit 1
  ) best on true
  left join public.banks b on b.id = best.bank_id;
$$;
grant execute on function public.get_financing_public_preview(uuid) to anon, authenticated;

-- ---- Verify the last-4 cédula (rate limited) -------------------------------
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

  select af.cedula_last4_hash into v_hash
  from public.application_financials af where af.application_id = t.application_id;
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

-- ---- Mark OTP verified (service role, from the OTP edge function) ----------
create or replace function public.mark_financing_otp_verified(p_token uuid, p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.financing_public_tokens;
begin
  select * into t from public.financing_public_tokens where token = p_token;
  if t.token is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.revoked or t.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if t.cedula_verified_at is null then return jsonb_build_object('ok', false, 'reason', 'cedula_first'); end if;
  update public.financing_public_tokens
    set otp_verified_at = coalesce(otp_verified_at, now()), verified_profile_id = coalesce(p_profile_id, verified_profile_id)
    where token = p_token;
  return jsonb_build_object('ok', true, 'applicationId', t.application_id);
end $$;
revoke all on function public.mark_financing_otp_verified(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_financing_otp_verified(uuid, uuid) to service_role;

-- ---- Full reveal (only after BOTH cédula + OTP verified) -------------------
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
    'authorized', true,
    'applicationId', fa.id,
    'code', fa.code,
    'createdAt', fa.created_at,
    'isPreapproval', (fa.vehicle_id is null),
    'kycStatus', fa.kyc_status::text,
    'consentSigned', fa.consent_signed,
    'vehicleLinkedAt', fa.vehicle_linked_at,
    'requestedAmount', fa.requested_amount,
    'down', fa.down_payment,
    'term', fa.term_years,
    'customerName', fa.buyer_name,
    'vehicle', case when v.id is not null then jsonb_build_object(
        'id', v.id, 'slug', v.slug, 'make', v.make, 'model', v.model, 'year', v.year,
        'price', v.price, 'dealer', d.name) else null end,
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bankName', bb.name, 'bankSlug', bb.slug, 'bankColor', bb.color, 'bankInitials', bb.initials,
        'status', ab.status::text, 'apr', ab.apr, 'term', ab.term_years, 'monthly', ab.monthly,
        'down', ab.down_required, 'approvedAmount', ab.approved_amount, 'validUntil', ab.valid_until,
        'notes', ab.notes, 'respondedAt', ab.responded_at)
        order by ab.responded_at desc nulls last)
      from public.application_banks ab join public.banks bb on bb.id = ab.bank_id
      where ab.application_id = fa.id
    ), '[]'::jsonb)
  ) into result
  from public.financing_applications x
  left join public.vehicles v on v.id = fa.vehicle_id
  left join public.dealers d on d.id = fa.dealer_id
  where x.id = fa.id;

  return result;
end $$;
grant execute on function public.get_financing_by_token(uuid) to anon, authenticated;
