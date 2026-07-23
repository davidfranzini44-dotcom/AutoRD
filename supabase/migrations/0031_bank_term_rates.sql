-- ============================================================
-- AutoRD 0031 — per-bank interest rates (tasas) by loan term (year)
-- Each bank maintains its own rate card: an APR for each term length. Rates are
-- publicly readable (so the customer estimate / dealers can reference them) but
-- only the owning bank (or an admin) can write its own rows.
-- ============================================================

create table if not exists public.bank_term_rates (
  bank_id uuid not null references public.banks(id) on delete cascade,
  term_years int not null check (term_years between 1 and 12),
  apr numeric(5,2) not null check (apr >= 0 and apr <= 100),
  updated_at timestamptz not null default now(),
  primary key (bank_id, term_years)
);

alter table public.bank_term_rates enable row level security;

drop policy if exists btr_read on public.bank_term_rates;
create policy btr_read on public.bank_term_rates for select using (true);

drop policy if exists btr_write on public.bank_term_rates;
create policy btr_write on public.bank_term_rates for all to authenticated
  using (bank_id = public.auth_bank_id() or public.is_admin())
  with check (bank_id = public.auth_bank_id() or public.is_admin());

grant select on public.bank_term_rates to anon, authenticated;
grant insert, update, delete on public.bank_term_rates to authenticated;

-- The signed-in bank's own rate card.
create or replace function public.get_my_bank_term_rates()
returns table(term_years int, apr numeric)
language sql stable security definer set search_path = public as $$
  select term_years, apr from public.bank_term_rates
  where bank_id = public.auth_bank_id()
  order by term_years;
$$;
revoke all on function public.get_my_bank_term_rates() from public;
grant execute on function public.get_my_bank_term_rates() to authenticated;

-- Upsert one term's APR for the caller's bank.
create or replace function public.set_bank_term_rate(p_term int, p_apr numeric)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid := public.auth_bank_id();
begin
  if b is null then raise exception 'not_a_bank'; end if;
  if p_term < 1 or p_term > 12 then raise exception 'bad_term'; end if;
  if p_apr is null or p_apr < 0 or p_apr > 100 then raise exception 'bad_apr'; end if;
  insert into public.bank_term_rates(bank_id, term_years, apr, updated_at)
  values (b, p_term, p_apr, now())
  on conflict (bank_id, term_years) do update set apr = excluded.apr, updated_at = now();
end $$;
revoke all on function public.set_bank_term_rate(int, numeric) from public;
grant execute on function public.set_bank_term_rate(int, numeric) to authenticated;

-- Seed a sensible default rate card for every bank so the page isn't empty.
insert into public.bank_term_rates(bank_id, term_years, apr)
select b.id, t.term, t.apr
from public.banks b
cross join (values (1,8.50),(2,8.75),(3,9.00),(4,9.25),(5,9.50),(6,9.75),(7,10.00),(8,10.50)) as t(term, apr)
on conflict (bank_id, term_years) do nothing;

notify pgrst, 'reload schema';
