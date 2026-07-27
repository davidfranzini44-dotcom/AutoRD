-- ============================================================
-- AutoRD — the buyer's own view of the cars they flagged
-- get_my_preapproval_interests() returns bare ids and is used only to toggle one
-- button's label, so a buyer who flags five cars has nowhere to review them and
-- NO way to take one back. The dealer keeps seeing an "interested, already
-- approved" lead the customer has moved on from.
--
-- Adds a detailed list for the buyer and a cancel path that retires the interest
-- (kept as history, drops off the dealer's active list).
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create or replace function public.get_my_preapproval_interests_detailed()
returns table (
  vehicle_id uuid,
  slug text,
  label text,
  price numeric,
  currency text,
  photo text,
  dealer_name text,
  status text,
  created_at timestamptz,
  within_budget boolean
)
language sql stable security definer set search_path = public as $$
  select
    v.id, v.slug,
    trim(v.make || ' ' || v.model || ' ' || v.year::text),
    v.price, v.currency,
    (select vp.url from public.vehicle_photos vp
      where vp.vehicle_id = v.id order by vp.is_cover desc nulls last, vp.position asc limit 1),
    d.name,
    pi.status,
    pi.created_at,
    -- Still inside the ceiling the bank granted? A pre-approval can shrink or
    -- expire after the buyer flags a car, so recompute rather than trust the snapshot.
    coalesce(v.price <= (
      select max(ab.approved_amount) from public.application_banks ab
      where ab.application_id = pi.application_id
        and ab.status::text in ('preaprobada','oferta','condicional')
        and (ab.valid_until is null or ab.valid_until >= current_date)
    ), false)
  from public.preapproval_interests pi
  join public.financing_applications fa on fa.id = pi.application_id
  join public.vehicles v on v.id = pi.vehicle_id
  left join public.dealers d on d.id = v.dealer_id
  where fa.buyer_id = auth.uid()
  order by (pi.status = 'activa') desc, pi.created_at desc;
$$;
grant execute on function public.get_my_preapproval_interests_detailed() to authenticated;

-- ---- Buyer takes an interest back ------------------------------------------
create or replace function public.cancel_preapproval_interest(p_vehicle_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_app uuid; v_label text;
begin
  select pi.application_id into v_app
  from public.preapproval_interests pi
  join public.financing_applications fa on fa.id = pi.application_id
  where fa.buyer_id = auth.uid() and pi.vehicle_id = p_vehicle_id and pi.status = 'activa'
  limit 1;
  if v_app is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  update public.preapproval_interests
     set status = 'archivada', resolved_at = now()
   where application_id = v_app and vehicle_id = p_vehicle_id;

  select trim(v.make || ' ' || v.model || ' ' || v.year::text) into v_label
  from public.vehicles v where v.id = p_vehicle_id;

  insert into public.financing_events (application_id, actor, kind, detail, meta)
  values (v_app, 'cliente', 'interest_cancelled', v_label, jsonb_build_object('vehicleId', p_vehicle_id));

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.cancel_preapproval_interest(uuid) to authenticated;
