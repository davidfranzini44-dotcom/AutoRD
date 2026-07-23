-- ============================================================
-- AutoRD 0032 — bank rate card by fuel type + per-bank financing rules
-- (a) APR is now set per (fuel_type x term_year), not just per term.
-- (b) Each bank declares max financing term by vehicle condition, so e.g. a
--     bank that won't finance a used car for 7 years caps used terms at 5.
-- Fuel vocabulary matches vehicles.fuel (Gasolina / Diésel / Híbrido) plus
-- Eléctrico for the future; the UI labels Diésel as "Gasoil".
-- ============================================================

-- 1) Fuel dimension on the rate card.
alter table public.bank_term_rates
  add column if not exists fuel_type text not null default 'Gasolina';
alter table public.bank_term_rates drop constraint if exists bank_term_rates_fuel_chk;
alter table public.bank_term_rates add constraint bank_term_rates_fuel_chk
  check (fuel_type in ('Gasolina','Diésel','Híbrido','Eléctrico'));
alter table public.bank_term_rates drop constraint if exists bank_term_rates_pkey;
alter table public.bank_term_rates add primary key (bank_id, fuel_type, term_years);

-- 2) Seed the other fuels from each bank's Gasolina card; Eléctrico gets an
--    incentive (lower), Diésel a small premium.
insert into public.bank_term_rates(bank_id, fuel_type, term_years, apr)
select r.bank_id, f.fuel, r.term_years, greatest(0, r.apr + f.delta)
from public.bank_term_rates r
cross join (values ('Diésel', 0.25), ('Híbrido', -0.25), ('Eléctrico', -0.75)) as f(fuel, delta)
where r.fuel_type = 'Gasolina'
on conflict (bank_id, fuel_type, term_years) do nothing;

-- 3) RPCs keyed by fuel.
drop function if exists public.get_my_bank_term_rates();
create function public.get_my_bank_term_rates()
returns table(fuel_type text, term_years int, apr numeric)
language sql stable security definer set search_path = public as $$
  select fuel_type, term_years, apr from public.bank_term_rates
  where bank_id = public.auth_bank_id()
  order by fuel_type, term_years;
$$;
revoke all on function public.get_my_bank_term_rates() from public;
grant execute on function public.get_my_bank_term_rates() to authenticated;

drop function if exists public.set_bank_term_rate(int, numeric);
create function public.set_bank_term_rate(p_fuel text, p_term int, p_apr numeric)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid := public.auth_bank_id();
begin
  if b is null then raise exception 'not_a_bank'; end if;
  if p_fuel not in ('Gasolina','Diésel','Híbrido','Eléctrico') then raise exception 'bad_fuel'; end if;
  if p_term < 1 or p_term > 12 then raise exception 'bad_term'; end if;
  if p_apr is null or p_apr < 0 or p_apr > 100 then raise exception 'bad_apr'; end if;
  insert into public.bank_term_rates(bank_id, fuel_type, term_years, apr, updated_at)
  values (b, p_fuel, p_term, p_apr, now())
  on conflict (bank_id, fuel_type, term_years) do update set apr = excluded.apr, updated_at = now();
end $$;
revoke all on function public.set_bank_term_rate(text, int, numeric) from public;
grant execute on function public.set_bank_term_rate(text, int, numeric) to authenticated;

-- 4) Per-bank financing rules: max term by condition.
create table if not exists public.bank_financing_rules (
  bank_id uuid primary key references public.banks(id) on delete cascade,
  max_term_new int not null default 8 check (max_term_new between 1 and 12),
  max_term_used int not null default 5 check (max_term_used between 1 and 12),
  updated_at timestamptz not null default now()
);
alter table public.bank_financing_rules enable row level security;
drop policy if exists bfr_read on public.bank_financing_rules;
create policy bfr_read on public.bank_financing_rules for select using (true);
drop policy if exists bfr_write on public.bank_financing_rules;
create policy bfr_write on public.bank_financing_rules for all to authenticated
  using (bank_id = public.auth_bank_id() or public.is_admin())
  with check (bank_id = public.auth_bank_id() or public.is_admin());
grant select on public.bank_financing_rules to anon, authenticated;
grant insert, update, delete on public.bank_financing_rules to authenticated;

insert into public.bank_financing_rules(bank_id) select id from public.banks
on conflict (bank_id) do nothing;

create or replace function public.get_my_bank_rules()
returns table(max_term_new int, max_term_used int)
language sql stable security definer set search_path = public as $$
  select max_term_new, max_term_used from public.bank_financing_rules where bank_id = public.auth_bank_id();
$$;
revoke all on function public.get_my_bank_rules() from public;
grant execute on function public.get_my_bank_rules() to authenticated;

create or replace function public.set_bank_rules(p_new int, p_used int)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid := public.auth_bank_id();
begin
  if b is null then raise exception 'not_a_bank'; end if;
  insert into public.bank_financing_rules(bank_id, max_term_new, max_term_used, updated_at)
  values (b, greatest(1, least(12, p_new)), greatest(1, least(12, p_used)), now())
  on conflict (bank_id) do update set max_term_new = excluded.max_term_new, max_term_used = excluded.max_term_used, updated_at = now();
end $$;
revoke all on function public.set_bank_rules(int, int) from public;
grant execute on function public.set_bank_rules(int, int) to authenticated;

notify pgrst, 'reload schema';
