-- ============================================================
-- AutoRD 0033 — add Banco Caribe as an active partner bank
-- Appears in the customer financing flow (banks list = active banks) and
-- competes for offers. Seeds its rate card (fuel x term) + financing rules.
-- Logo auto-wires once src/assets/banks/banco-caribe.png is added.
-- ============================================================

insert into public.banks (name, slug, color, initials, active)
select 'Banco Caribe', 'banco-caribe', '#00843d', 'BC', true
where not exists (select 1 from public.banks where slug = 'banco-caribe');

-- Rate card: Gasolina base.
insert into public.bank_term_rates (bank_id, fuel_type, term_years, apr)
select b.id, 'Gasolina', t.term, t.apr
from public.banks b
cross join (values (1,8.75),(2,9.00),(3,9.25),(4,9.50),(5,9.75),(6,10.00),(7,10.25),(8,10.75)) as t(term, apr)
where b.slug = 'banco-caribe'
on conflict (bank_id, fuel_type, term_years) do nothing;

-- Other fuels derived from Gasolina (Eléctrico gets an incentive).
insert into public.bank_term_rates (bank_id, fuel_type, term_years, apr)
select r.bank_id, f.fuel, r.term_years, greatest(0, r.apr + f.delta)
from public.bank_term_rates r
join public.banks b on b.id = r.bank_id and b.slug = 'banco-caribe'
cross join (values ('Diésel',0.25),('Híbrido',-0.25),('Eléctrico',-0.75)) as f(fuel, delta)
where r.fuel_type = 'Gasolina'
on conflict (bank_id, fuel_type, term_years) do nothing;

-- Financing rules (defaults: new <= 8y, used <= 5y).
insert into public.bank_financing_rules (bank_id)
select id from public.banks where slug = 'banco-caribe'
on conflict (bank_id) do nothing;
