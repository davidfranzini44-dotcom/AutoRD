-- ============================================================
-- AutoRD — let the authenticated buyer accept an offer from /mi-financiamiento
-- (not only via the /f/:token portal). The selection + notification + vehicle
-- reservation + audit logic is extracted into one internal function so both the
-- token path and the authenticated path stay identical.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

-- Shared core (no auth check — callers gate access). Not granted to anyone;
-- only the SECURITY DEFINER wrappers (owned by postgres) can call it.
create or replace function public._apply_offer_acceptance(p_application_id uuid, p_bank_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ab public.application_banks; v_bank_name text; v_has_vehicle boolean; v_dealer uuid;
begin
  select r.* into ab
  from public.application_banks r join public.banks b on b.id = r.bank_id
  where r.application_id = p_application_id and b.slug = p_bank_slug
    and r.status::text in ('preaprobada', 'oferta', 'condicional')
  order by r.responded_at desc nulls last limit 1;
  if ab.id is null then return jsonb_build_object('ok', false, 'reason', 'no_such_offer'); end if;

  update public.application_banks set selected = (id = ab.id) where application_id = p_application_id;
  select name into v_bank_name from public.banks where id = ab.bank_id;
  select (fa.vehicle_id is not null), fa.dealer_id into v_has_vehicle, v_dealer
    from public.financing_applications fa where fa.id = p_application_id;
  update public.financing_applications
    set client_accepted_at = coalesce(client_accepted_at, now()),
        selected_bank_id = ab.bank_id,
        reserved_until = case when v_has_vehicle then now() + interval '48 hours' else reserved_until end
    where id = p_application_id;

  insert into public.financing_events (application_id, actor, kind, detail, meta)
    values (p_application_id, 'cliente', 'accepted', v_bank_name, jsonb_build_object('bankId', ab.bank_id));

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
revoke all on function public._apply_offer_acceptance(uuid, text) from public, anon, authenticated;

-- Token path (public portal) — now delegates to the shared core.
create or replace function public.accept_financing_offer(p_token uuid, p_bank_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.financing_public_tokens;
begin
  select * into t from public.financing_public_tokens where token = p_token;
  if t.token is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.revoked or t.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if t.cedula_verified_at is null or t.otp_verified_at is null then
    return jsonb_build_object('ok', false, 'reason', 'unverified');
  end if;
  return public._apply_offer_acceptance(t.application_id, p_bank_slug);
end $$;
grant execute on function public.accept_financing_offer(uuid, text) to anon, authenticated;

-- Authenticated path (buyer on /mi-financiamiento) — gated on ownership.
create or replace function public.accept_financing_offer_auth(p_application_id uuid, p_bank_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.financing_applications fa
    where fa.id = p_application_id and (fa.buyer_id = auth.uid() or public.is_admin())
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  return public._apply_offer_acceptance(p_application_id, p_bank_slug);
end $$;
grant execute on function public.accept_financing_offer_auth(uuid, text) to authenticated;
