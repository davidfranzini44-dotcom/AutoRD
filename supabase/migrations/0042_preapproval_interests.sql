-- ============================================================
-- AutoRD — pre-approval interest in specific vehicles
-- A car-agnostic pre-approval lets the buyer signal INTEREST in several cars
-- that fit their approved amount. Each interested dealer is notified and sees
-- "this customer is already approved to buy YOUR car" — better intent signal
-- than a cold lead.
-- When the buyer finally COMMITS to one car (vehicle attached to the
-- application), that car's interest becomes 'convertida' and every other one
-- becomes 'archivada' — dropping off the other dealers' active screens and
-- living on only as history.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create table if not exists public.preapproval_interests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  dealer_id uuid references public.dealers(id) on delete set null,
  status text not null default 'activa',  -- activa | convertida | archivada
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (application_id, vehicle_id)
);
create index if not exists idx_preint_dealer on public.preapproval_interests(dealer_id, status);
create index if not exists idx_preint_app on public.preapproval_interests(application_id, status);
alter table public.preapproval_interests enable row level security;

-- Buyer sees their own; dealer sees interests in their cars; routed bank + admin too.
drop policy if exists preint_read on public.preapproval_interests;
create policy preint_read on public.preapproval_interests for select to authenticated using (
  dealer_id = public.auth_dealer_id() or public.is_admin()
  or exists (select 1 from public.financing_applications fa where fa.id = application_id and (
    fa.buyer_id = auth.uid()
    or exists (select 1 from public.application_banks ab where ab.application_id = fa.id and ab.bank_id = public.auth_bank_id())))
);

-- ---- Buyer expresses interest in a specific vehicle ------------------------
create or replace function public.express_preapproval_interest(p_vehicle_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fa public.financing_applications; v public.vehicles; v_ceiling numeric;
  v_dealer uuid; v_name text; v_existing public.preapproval_interests;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;

  select * into v from public.vehicles where id = p_vehicle_id;
  if v.id is null then return jsonb_build_object('ok', false, 'reason', 'no_vehicle'); end if;

  -- The buyer's most recent car-agnostic, un-committed pre-approval.
  select * into fa from public.financing_applications
   where buyer_id = auth.uid() and vehicle_id is null and client_accepted_at is null
   order by created_at desc limit 1;
  if fa.id is null then return jsonb_build_object('ok', false, 'reason', 'no_preapproval'); end if;

  -- Highest still-valid approved ceiling across the routed banks.
  select max(ab.approved_amount) into v_ceiling
    from public.application_banks ab
   where ab.application_id = fa.id
     and ab.status::text in ('preaprobada', 'oferta', 'condicional')
     and (ab.valid_until is null or ab.valid_until >= current_date);
  if v_ceiling is null or v_ceiling <= 0 then return jsonb_build_object('ok', false, 'reason', 'no_active_approval'); end if;
  if v.price > v_ceiling then
    return jsonb_build_object('ok', false, 'reason', 'over_budget', 'ceiling', v_ceiling, 'price', v.price);
  end if;

  v_dealer := v.dealer_id;

  select * into v_existing from public.preapproval_interests
   where application_id = fa.id and vehicle_id = p_vehicle_id;
  if v_existing.id is not null then
    if v_existing.status <> 'activa' then
      update public.preapproval_interests set status = 'activa', resolved_at = null where id = v_existing.id;
    end if;
    return jsonb_build_object('ok', true, 'already', true, 'ceiling', v_ceiling);
  end if;

  insert into public.preapproval_interests (application_id, vehicle_id, dealer_id)
  values (fa.id, p_vehicle_id, v_dealer);

  v_name := coalesce(fa.buyer_name, 'Un cliente');

  insert into public.financing_events (application_id, actor, kind, detail, meta)
  values (fa.id, 'cliente', 'interest', trim(v.make || ' ' || v.model || ' ' || v.year::text),
    jsonb_build_object('vehicleId', p_vehicle_id, 'ceiling', v_ceiling));

  -- Tell the dealer: this is a pre-approved buyer, already able to buy this car.
  if v_dealer is not null then
    insert into public.notifications (profile_id, kind, title, body, link)
    select p.id, 'preapproval_interest',
      v_name || ' está interesado en tu ' || v.make || ' ' || v.model,
      'Cliente PRE-APROBADO hasta ' || to_char(v_ceiling, 'FM999,999,999') ||
        ' — ya puede comprar este vehículo. Contáctalo para cerrar.',
      '/dealer/financiamiento'
    from public.profiles p where p.dealer_id = v_dealer and p.role = 'dealer';
  end if;

  return jsonb_build_object('ok', true, 'ceiling', v_ceiling);
end $$;
grant execute on function public.express_preapproval_interest(uuid) to authenticated;

-- ---- Buyer: which cars have I flagged? -------------------------------------
create or replace function public.get_my_preapproval_interests()
returns table (vehicle_id uuid, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select pi.vehicle_id, pi.status, pi.created_at
  from public.preapproval_interests pi
  join public.financing_applications fa on fa.id = pi.application_id
  where fa.buyer_id = auth.uid();
$$;
grant execute on function public.get_my_preapproval_interests() to authenticated;

-- ---- Dealer: pre-approved buyers interested in my cars ---------------------
-- Outcomes/eligibility only — no income, cédula or credit detail.
create or replace function public.get_dealer_preapproval_interests()
returns table (
  interest_id uuid, application_id uuid, status text, created_at timestamptz,
  customer text, customer_phone text, vehicle_id uuid, vehicle_label text,
  vehicle_price numeric, approved_amount numeric, valid_until date, kyc_status text
)
language sql stable security definer set search_path = public as $$
  select pi.id, pi.application_id, pi.status, pi.created_at,
         fa.buyer_name, fa.buyer_phone, v.id,
         trim(v.make || ' ' || v.model || ' ' || v.year::text), v.price,
         (select max(ab.approved_amount) from public.application_banks ab
           where ab.application_id = fa.id
             and ab.status::text in ('preaprobada','oferta','condicional')
             and (ab.valid_until is null or ab.valid_until >= current_date)),
         (select min(ab.valid_until) from public.application_banks ab
           where ab.application_id = fa.id and ab.approved_amount is not null),
         fa.kyc_status::text
  from public.preapproval_interests pi
  join public.financing_applications fa on fa.id = pi.application_id
  join public.vehicles v on v.id = pi.vehicle_id
  where pi.dealer_id = public.auth_dealer_id()
    and public.auth_dealer_id() is not null
    and pi.status = 'activa'
  order by pi.created_at desc;
$$;
grant execute on function public.get_dealer_preapproval_interests() to authenticated;

-- ---- Commit collapses the interests ----------------------------------------
-- When the application gets a vehicle attached (the buyer decided), that car's
-- interest converts and every other one is archived — so it disappears from the
-- other dealers' active lists and remains only as history.
create or replace function public.trg_resolve_interests_on_commit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is not null and old.vehicle_id is distinct from new.vehicle_id then
    update public.preapproval_interests
       set status = case when vehicle_id = new.vehicle_id then 'convertida' else 'archivada' end,
           resolved_at = now()
     where application_id = new.id and status = 'activa';
  end if;
  return new;
end $$;
drop trigger if exists resolve_interests_on_commit on public.financing_applications;
create trigger resolve_interests_on_commit after update on public.financing_applications
  for each row execute function public.trg_resolve_interests_on_commit();
