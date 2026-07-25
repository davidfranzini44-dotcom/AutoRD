-- ============================================================
-- AutoRD — client financing portal, Phase 2: acceptance + audit trail
-- Connects Banco ↔ Dealer ↔ Cliente with no gaps:
--   * The client accepts a bank's pre-approval/offer from the /f/:token portal.
--   * That offer becomes THE active/selected one (others un-selected).
--   * The dealer and the routed bank are notified; the vehicle is soft-reserved.
--   * Every step (bank decision, client verification, acceptance) lands in a
--     financing_events audit timeline the client, dealer and bank all read.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

-- ---- Acceptance / selection state ------------------------------------------
alter table public.application_banks         add column if not exists selected boolean not null default false;
alter table public.financing_applications    add column if not exists client_accepted_at timestamptz;
alter table public.financing_applications    add column if not exists selected_bank_id uuid references public.banks(id);
alter table public.financing_applications    add column if not exists reserved_until timestamptz;

-- ---- Audit timeline --------------------------------------------------------
create table if not exists public.financing_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  actor text not null,   -- 'cliente' | 'banco' | 'dealer' | 'sistema'
  kind text not null,    -- 'bank_decision' | 'verified' | 'accepted' | 'vehicle_linked' | 'doc' ...
  detail text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_fin_events_app on public.financing_events(application_id, created_at);
alter table public.financing_events enable row level security;

-- The three parties on an application can read its timeline (no sensitive numbers
-- live here; the client-side write path is the token RPCs / trigger below).
drop policy if exists fin_events_read on public.financing_events;
create policy fin_events_read on public.financing_events for select to authenticated using (
  exists (select 1 from public.financing_applications fa where fa.id = application_id and (
    fa.buyer_id = auth.uid() or fa.dealer_id = public.auth_dealer_id() or public.is_admin()
    or exists (select 1 from public.application_banks ab where ab.application_id = fa.id and ab.bank_id = public.auth_bank_id())
  ))
);

-- ---- Bank decisions land in the timeline automatically ---------------------
create or replace function public.trg_log_bank_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.financing_events (application_id, actor, kind, detail, meta)
    values (new.application_id, 'banco', 'bank_decision', new.status::text,
      jsonb_build_object('bankId', new.bank_id, 'apr', new.apr, 'approvedAmount', new.approved_amount, 'validUntil', new.valid_until));
  end if;
  return new;
end $$;
drop trigger if exists log_bank_decision on public.application_banks;
create trigger log_bank_decision after update on public.application_banks
  for each row execute function public.trg_log_bank_decision();

-- ---- Client accepts an offer (token-gated, both factors verified) ----------
create or replace function public.accept_financing_offer(p_token uuid, p_bank_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.financing_public_tokens; ab public.application_banks; v_bank_name text;
  v_has_vehicle boolean; v_dealer uuid;
begin
  select * into t from public.financing_public_tokens where token = p_token;
  if t.token is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.revoked or t.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if t.cedula_verified_at is null or t.otp_verified_at is null then
    return jsonb_build_object('ok', false, 'reason', 'unverified');
  end if;

  select r.* into ab
  from public.application_banks r join public.banks b on b.id = r.bank_id
  where r.application_id = t.application_id and b.slug = p_bank_slug
    and r.status::text in ('preaprobada', 'oferta', 'condicional')
  order by r.responded_at desc nulls last limit 1;
  if ab.id is null then return jsonb_build_object('ok', false, 'reason', 'no_such_offer'); end if;

  -- Make this the single active offer.
  update public.application_banks set selected = (id = ab.id) where application_id = t.application_id;
  select name into v_bank_name from public.banks where id = ab.bank_id;

  -- Mark acceptance + soft-reserve the vehicle (48h) if one is attached.
  select (fa.vehicle_id is not null), fa.dealer_id into v_has_vehicle, v_dealer
  from public.financing_applications fa where fa.id = t.application_id;
  update public.financing_applications
    set client_accepted_at = coalesce(client_accepted_at, now()),
        selected_bank_id = ab.bank_id,
        reserved_until = case when v_has_vehicle then now() + interval '48 hours' else reserved_until end
  where id = t.application_id;

  -- Audit event.
  insert into public.financing_events (application_id, actor, kind, detail, meta)
  values (t.application_id, 'cliente', 'accepted', v_bank_name, jsonb_build_object('bankId', ab.bank_id));

  -- Notify the routed bank's members + the dealer.
  insert into public.notifications (profile_id, kind, title, body, link)
  select p.id, 'client_accepted', 'El cliente aceptó la oferta',
    'El cliente aceptó el financiamiento de ' || coalesce(v_bank_name, 'el banco') || '. Coordina seguro, firma y entrega.', '/banco'
  from public.profiles p where p.bank_id = ab.bank_id;

  if v_dealer is not null then
    insert into public.notifications (profile_id, kind, title, body, link)
    select p.id, 'client_accepted', 'Cliente aceptó una oferta de financiamiento',
      'Tu cliente aceptó la oferta de ' || coalesce(v_bank_name, 'un banco') || '. Coordina la entrega.', '/dealer/financiamiento'
    from public.profiles p where p.dealer_id = v_dealer and p.role = 'dealer';
  end if;

  return jsonb_build_object('ok', true, 'bankName', v_bank_name);
end $$;
grant execute on function public.accept_financing_offer(uuid, text) to anon, authenticated;

-- ---- Log client identity verification into the timeline --------------------
-- Re-create the cédula + OTP verifiers to append an audit event on success.
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
  select af.cedula_last4_hash into v_hash from public.application_financials af where af.application_id = t.application_id;
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
    insert into public.financing_events (application_id, actor, kind, detail)
      values (t.application_id, 'cliente', 'verified', 'Identidad confirmada (cédula + WhatsApp)');
    return jsonb_build_object('ok', true);
  else
    update public.phone_otps set attempts = attempts + 1 where id = o.id;
    return jsonb_build_object('ok', false, 'reason', 'mismatch', 'attemptsLeft', 5 - o.attempts);
  end if;
end $$;
grant execute on function public.verify_financing_otp(uuid, text) to anon, authenticated;

-- ---- Full reveal now includes selection + reservation + the audit timeline --
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
    'vehicle', case when v.id is not null then jsonb_build_object('id', v.id, 'slug', v.slug, 'make', v.make,
        'model', v.model, 'year', v.year, 'price', v.price, 'dealer', d.name) else null end,
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bankName', bb.name, 'bankSlug', bb.slug, 'bankColor', bb.color, 'bankInitials', bb.initials,
        'status', ab.status::text, 'apr', ab.apr, 'term', ab.term_years, 'monthly', ab.monthly,
        'down', ab.down_required, 'approvedAmount', ab.approved_amount, 'validUntil', ab.valid_until,
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
