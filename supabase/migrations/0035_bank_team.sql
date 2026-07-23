-- ============================================================
-- AutoRD 0035 — bank teams (self-serve users per enrolled bank)
-- Mirrors the dealer team model (0024): a bank "owner" (created by the platform
-- when the bank is enrolled) can add/administer their own analyst accounts with
-- granular permissions. All account creation happens server-side in the
-- `bank-team` edge function; this migration adds the column, the same-bank read
-- policy, and a helper to seed a freshly enrolled bank's rate card + rules.
-- ============================================================

-- owner | employee (null for legacy/non-team bank users)
alter table public.profiles
  add column if not exists bank_role text check (bank_role in ('owner', 'employee'));

-- Existing bank users become owners of their bank.
update public.profiles set bank_role = 'owner'
where role = 'bank' and bank_id is not null and bank_role is null;

-- Same-bank team read (mirror of profiles_team_read for dealers). auth_bank_id()
-- is SECURITY DEFINER so it doesn't recurse into this policy.
drop policy if exists profiles_bank_team_read on public.profiles;
create policy profiles_bank_team_read on public.profiles
  for select using (bank_id is not null and bank_id = public.auth_bank_id());

-- Seed a newly enrolled bank with a default rate card (fuel x term) + rules,
-- matching the 0032/0033 defaults. Called by the enroll action (service role).
create or replace function public.seed_bank_defaults(p_bank_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bank_term_rates (bank_id, fuel_type, term_years, apr)
  select p_bank_id, 'Gasolina', t.term, t.apr
  from (values (1,8.75),(2,9.00),(3,9.25),(4,9.50),(5,9.75),(6,10.00),(7,10.25),(8,10.75)) as t(term, apr)
  on conflict (bank_id, fuel_type, term_years) do nothing;

  insert into public.bank_term_rates (bank_id, fuel_type, term_years, apr)
  select r.bank_id, f.fuel, r.term_years, greatest(0, r.apr + f.delta)
  from public.bank_term_rates r
  cross join (values ('Diésel',0.25),('Híbrido',-0.25),('Eléctrico',-0.75)) as f(fuel, delta)
  where r.bank_id = p_bank_id and r.fuel_type = 'Gasolina'
  on conflict (bank_id, fuel_type, term_years) do nothing;

  insert into public.bank_financing_rules (bank_id)
  values (p_bank_id)
  on conflict (bank_id) do nothing;
end $$;

revoke all on function public.seed_bank_defaults(uuid) from public;
grant execute on function public.seed_bank_defaults(uuid) to service_role;
