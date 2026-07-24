-- ============================================================
-- AutoRD — client financing portal, WhatsApp OTP step (Phase 1)
-- Two anon RPCs that reuse the existing phone_otps + wa_outbox worker:
--   * start_financing_otp(token)  — sends a 6-digit code to the ON-FILE number
--     for the application (never a client-supplied one), so only the real owner
--     can receive it. Rate limited. Requires the last-4 cédula already verified.
--   * verify_financing_otp(token, code) — verifies the code, stamps the token's
--     otp_verified_at. Attempt-capped.
-- No new edge function: the existing autord-wa-worker drains wa_outbox.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create or replace function private.hmac_hex(p_text text)
returns text language sql stable security definer set search_path = private, public, extensions as $$
  select encode(extensions.hmac(p_text, (select value from private.secrets where name = 'cedula_pepper'), 'sha256'), 'hex');
$$;

-- Normalize a DR phone to worker digits (country code + 10-digit local, no '+').
create or replace function private.norm_do_phone(p_phone text)
returns text language sql immutable as $$
  select case
    when length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) = 10
      then '1' || regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')
    else regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')
  end;
$$;

-- ---- Send the OTP to the on-file phone -------------------------------------
create or replace function public.start_financing_otp(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  t public.financing_public_tokens; v_phone text; v_digits text; v_code text; recent int;
begin
  select * into t from public.financing_public_tokens where token = p_token;
  if t.token is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.revoked or t.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if t.cedula_verified_at is null then return jsonb_build_object('ok', false, 'reason', 'cedula_first'); end if;
  if t.otp_verified_at is not null then return jsonb_build_object('ok', true, 'alreadyVerified', true); end if;

  select fa.buyer_phone into v_phone from public.financing_applications fa where fa.id = t.application_id;
  v_digits := private.norm_do_phone(v_phone);
  if v_digits is null or length(v_digits) < 11 then return jsonb_build_object('ok', false, 'reason', 'no_phone_on_file'); end if;

  -- rate limit: 30s gap + <= 5 per hour for this phone in the financing flow
  select count(*) into recent from public.phone_otps
    where phone = v_digits and purpose = 'financing' and created_at > now() - interval '30 seconds';
  if recent > 0 then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  select count(*) into recent from public.phone_otps
    where phone = v_digits and purpose = 'financing' and created_at > now() - interval '1 hour';
  if recent >= 5 then return jsonb_build_object('ok', false, 'reason', 'rate_limited'); end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into public.phone_otps (phone, code_hash, purpose, expires_at)
    values (v_digits, private.hmac_hex(v_code), 'financing', now() + interval '10 minutes');
  insert into public.wa_outbox (to_phone, body)
    values (v_digits, 'Tu código AutoRD para ver tu financiamiento es ' || v_code || '. Vence en 10 minutos. No lo compartas con nadie.');

  return jsonb_build_object('ok', true, 'phoneHint', right(v_digits, 4));
end $$;
grant execute on function public.start_financing_otp(uuid) to anon, authenticated;

-- ---- Verify the OTP + stamp the token --------------------------------------
create or replace function public.verify_financing_otp(p_token uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  t public.financing_public_tokens; v_phone text; v_digits text; o public.phone_otps;
begin
  select * into t from public.financing_public_tokens where token = p_token;
  if t.token is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.revoked or t.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if t.cedula_verified_at is null then return jsonb_build_object('ok', false, 'reason', 'cedula_first'); end if;
  if t.otp_verified_at is not null then return jsonb_build_object('ok', true); end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_format'); end if;

  select fa.buyer_phone into v_phone from public.financing_applications fa where fa.id = t.application_id;
  v_digits := private.norm_do_phone(v_phone);

  select * into o from public.phone_otps
    where phone = v_digits and purpose = 'financing' and consumed_at is null and expires_at > now()
    order by created_at desc limit 1;
  if o.id is null then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if o.attempts >= 6 then return jsonb_build_object('ok', false, 'reason', 'too_many_attempts'); end if;

  if o.code_hash = private.hmac_hex(p_code) then
    update public.phone_otps set consumed_at = now() where id = o.id;
    update public.financing_public_tokens set otp_verified_at = coalesce(otp_verified_at, now()) where token = p_token;
    return jsonb_build_object('ok', true);
  else
    update public.phone_otps set attempts = attempts + 1 where id = o.id;
    return jsonb_build_object('ok', false, 'reason', 'mismatch', 'attemptsLeft', 5 - o.attempts);
  end if;
end $$;
grant execute on function public.verify_financing_otp(uuid, text) to anon, authenticated;
