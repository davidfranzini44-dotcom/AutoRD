-- Real market pricing analytics.
-- Stores comparable listing snapshots from external/public sources, then exposes
-- dealer/bank-safe analytics through RPCs. If there are not enough comparables,
-- the functions say so instead of inventing a price opinion.

create table if not exists public.vehicle_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  source_url text,
  snapshot_date date not null default current_date,
  captured_at timestamptz not null default now(),
  dealer_name text,
  dealer_id uuid references public.dealers(id) on delete set null,
  make text not null,
  model text not null,
  year int,
  trim text,
  mileage int,
  price numeric not null,
  currency text not null default 'DOP',
  condition text,
  transmission text,
  fuel text,
  body_type text,
  color text,
  location text,
  raw jsonb not null default '{}'::jsonb,
  constraint vehicle_market_snapshots_currency_chk check (currency in ('DOP','USD')),
  constraint vehicle_market_snapshots_price_chk check (price > 0)
);

create unique index if not exists idx_vehicle_market_source_daily
  on public.vehicle_market_snapshots(source, source_url, snapshot_date);

create index if not exists idx_vehicle_market_lookup
  on public.vehicle_market_snapshots(make, model, year, currency, captured_at desc);

create index if not exists idx_vehicle_market_source_id
  on public.vehicle_market_snapshots(source, source_id)
  where source_id is not null;

alter table public.vehicle_market_snapshots enable row level security;

drop policy if exists vehicle_market_snapshots_read on public.vehicle_market_snapshots;
create policy vehicle_market_snapshots_read
  on public.vehicle_market_snapshots for select
  to authenticated
  using (true);

drop policy if exists vehicle_market_snapshots_admin_write on public.vehicle_market_snapshots;
create policy vehicle_market_snapshots_admin_write
  on public.vehicle_market_snapshots for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.vehicle_model_key(p text) returns text
  language sql immutable as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function public.vehicle_market_price_analytics(
  p_vehicle_id uuid,
  p_window_days int default 120
) returns table (
  vehicle_id uuid,
  comparable_count int,
  source_count int,
  autord_count int,
  external_count int,
  market_min numeric,
  market_median numeric,
  market_max numeric,
  recommended_low numeric,
  recommended_high numeric,
  delta_pct numeric,
  label text,
  confidence text,
  basis text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.vehicles;
  allowed boolean;
  min_sample int := 5;
begin
  select * into v from public.vehicles where id = p_vehicle_id;
  if not found then return; end if;

  allowed :=
    v.status = 'publicado'
    or v.dealer_id = public.auth_dealer_id()
    or public.is_admin()
    or exists (
      select 1
      from public.financing_applications fa
      join public.application_banks ab on ab.application_id = fa.id
      where fa.vehicle_id = v.id
        and ab.bank_id = public.auth_bank_id()
    );

  if not allowed then return; end if;

  return query
  with comparables as (
    select
      'autord'::text as src,
      v2.price::numeric as price,
      v2.year,
      v2.mileage,
      v2.created_at as seen_at
    from public.vehicles v2
    where v2.id <> v.id
      and v2.status = 'publicado'
      and v2.price > 0
      and v2.currency = v.currency
      and lower(v2.make) = lower(v.make)
      and public.vehicle_model_key(v2.model) = public.vehicle_model_key(v.model)
      and (v.year is null or v2.year between v.year - 2 and v.year + 2)

    union all

    select
      coalesce(ms.source, 'external')::text as src,
      ms.price::numeric as price,
      ms.year,
      ms.mileage,
      ms.captured_at as seen_at
    from public.vehicle_market_snapshots ms
    where ms.price > 0
      and ms.currency = v.currency
      and lower(ms.make) = lower(v.make)
      and public.vehicle_model_key(ms.model) = public.vehicle_model_key(v.model)
      and (v.year is null or ms.year is null or ms.year between v.year - 2 and v.year + 2)
      and ms.captured_at >= now() - make_interval(days => greatest(coalesce(p_window_days, 120), 30))
      and coalesce(ms.source_url, '') <> coalesce(v.source_url, '')
  ),
  stats as (
    select
      count(*)::int as n,
      count(distinct src)::int as sources,
      count(*) filter (where src = 'autord')::int as autord_n,
      count(*) filter (where src <> 'autord')::int as ext_n,
      percentile_cont(0.10) within group (order by price)::numeric as p10,
      percentile_cont(0.25) within group (order by price)::numeric as p25,
      percentile_cont(0.50) within group (order by price)::numeric as p50,
      percentile_cont(0.75) within group (order by price)::numeric as p75,
      percentile_cont(0.90) within group (order by price)::numeric as p90
    from comparables
  )
  select
    v.id,
    s.n,
    s.sources,
    s.autord_n,
    s.ext_n,
    case when s.n >= min_sample then round(s.p10, 0) else null end,
    case when s.n >= min_sample then round(s.p50, 0) else null end,
    case when s.n >= min_sample then round(s.p90, 0) else null end,
    case when s.n >= min_sample then round(s.p25, 0) else null end,
    case when s.n >= min_sample then round(s.p75, 0) else null end,
    case when s.n >= min_sample and s.p50 > 0 then round(((v.price - s.p50) / s.p50) * 100, 1) else null end,
    case
      when s.n < min_sample then 'Sin suficientes comparables'
      when ((v.price - s.p50) / s.p50) <= -0.08 then 'Excelente precio'
      when ((v.price - s.p50) / s.p50) <= -0.03 then 'Buen precio'
      when ((v.price - s.p50) / s.p50) <= 0.06 then 'Precio justo'
      when ((v.price - s.p50) / s.p50) <= 0.12 then 'Un poco alto'
      else 'Muy alto'
    end,
    case
      when s.n >= 20 and s.sources >= 2 then 'alta'
      when s.n >= 8 then 'media'
      when s.n >= min_sample then 'baja'
      else 'insuficiente'
    end,
    case
      when s.n >= min_sample then 'Misma marca/modelo, +/- 2 años, misma moneda, últimos ' || greatest(coalesce(p_window_days, 120), 30)::text || ' días'
      else 'Se necesitan al menos 5 comparables reales'
    end
  from stats s;
end;
$$;

create or replace function public.my_dealer_vehicle_market_analytics()
returns table (
  vehicle_id uuid,
  slug text,
  make text,
  model text,
  year int,
  price numeric,
  currency text,
  comparable_count int,
  source_count int,
  market_median numeric,
  recommended_low numeric,
  recommended_high numeric,
  delta_pct numeric,
  label text,
  confidence text,
  basis text
)
language sql
security definer
set search_path = public
as $$
  select
    v.id, v.slug, v.make, v.model, v.year, v.price, v.currency,
    a.comparable_count, a.source_count, a.market_median,
    a.recommended_low, a.recommended_high, a.delta_pct, a.label, a.confidence, a.basis
  from public.vehicles v
  left join lateral public.vehicle_market_price_analytics(v.id) a on true
  where v.dealer_id = public.auth_dealer_id() or public.is_admin()
  order by v.created_at desc;
$$;

create or replace function public.bank_application_vehicle_market_analytics(p_application_id uuid)
returns table (
  application_id uuid,
  vehicle_id uuid,
  vehicle_price numeric,
  currency text,
  requested_amount numeric,
  comparable_count int,
  source_count int,
  market_median numeric,
  recommended_low numeric,
  recommended_high numeric,
  delta_pct numeric,
  label text,
  confidence text,
  ltv_pct numeric,
  collateral_risk text,
  basis text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  fa public.financing_applications;
begin
  select * into fa from public.financing_applications where id = p_application_id;
  if not found or fa.vehicle_id is null then return; end if;
  if not (public.is_admin() or public.bank_on_app(fa.id)) then return; end if;

  return query
  select
    fa.id,
    fa.vehicle_id,
    v.price,
    v.currency,
    fa.requested_amount,
    a.comparable_count,
    a.source_count,
    a.market_median,
    a.recommended_low,
    a.recommended_high,
    a.delta_pct,
    a.label,
    a.confidence,
    case
      when coalesce(a.market_median, v.price) > 0 and fa.requested_amount is not null
        then round((fa.requested_amount / coalesce(a.market_median, v.price)) * 100, 1)
      else null
    end,
    case
      when a.confidence = 'insuficiente' then 'Sin suficientes comparables'
      when fa.requested_amount is null then 'Sin monto solicitado'
      when coalesce(a.market_median, v.price) <= 0 then 'Sin referencia'
      when (fa.requested_amount / coalesce(a.market_median, v.price)) <= 0.75 then 'Normal'
      when (fa.requested_amount / coalesce(a.market_median, v.price)) <= 0.90 then 'Revisar inicial'
      else 'Alto'
    end,
    a.basis
  from public.vehicles v
  left join lateral public.vehicle_market_price_analytics(v.id) a on true
  where v.id = fa.vehicle_id;
end;
$$;

revoke all on function public.vehicle_market_price_analytics(uuid, int) from public;
revoke all on function public.my_dealer_vehicle_market_analytics() from public;
revoke all on function public.bank_application_vehicle_market_analytics(uuid) from public;

grant execute on function public.vehicle_market_price_analytics(uuid, int) to authenticated;
grant execute on function public.my_dealer_vehicle_market_analytics() to authenticated;
grant execute on function public.bank_application_vehicle_market_analytics(uuid) to authenticated;
