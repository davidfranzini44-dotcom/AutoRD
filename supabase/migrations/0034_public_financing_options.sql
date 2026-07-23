-- ============================================================
-- AutoRD 0034 — public financing options for the customer flow
-- Exposes every active bank's financing rules (max term by condition) plus the
-- fuels it actually offers rates for, so the (possibly anonymous) financing flow
-- can cap the term selector and route a solicitud only to banks whose rules
-- cover the chosen car. Read-only; no PII. SECURITY DEFINER so it can read
-- bank_financing_rules regardless of that table's RLS.
-- ============================================================

create or replace function public.get_financing_bank_options()
returns table (
  bank_id uuid,
  slug text,
  name text,
  color text,
  initials text,
  max_term_new int,
  max_term_used int,
  fuels text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.slug,
    b.name,
    b.color,
    b.initials,
    coalesce(fr.max_term_new, 8)  as max_term_new,
    coalesce(fr.max_term_used, 5) as max_term_used,
    coalesce(
      (select array_agg(distinct r.fuel_type order by r.fuel_type)
         from public.bank_term_rates r
        where r.bank_id = b.id),
      '{}'::text[]
    ) as fuels
  from public.banks b
  left join public.bank_financing_rules fr on fr.bank_id = b.id
  where b.active
  order by b.name;
$$;

revoke all on function public.get_financing_bank_options() from public;
grant execute on function public.get_financing_bank_options() to anon, authenticated;
