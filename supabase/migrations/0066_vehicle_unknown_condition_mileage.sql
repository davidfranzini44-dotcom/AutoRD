-- Imports must be able to say "we don't know" instead of defaulting.
--
-- SuperCarros publishes no condition field at all, and prints "Uso: N/D" for
-- mileage on new and used cars alike (verified against a 2026 Honda CR-V and a
-- 2021 Toyota Highlander -- identical output). Every import was therefore
-- stamped `usado` with 0 km on no evidence, and a buyer filtering "usado, 0 km"
-- got 53 cars we simply had no data for.

-- null mileage = not stated by the source. 0 now means a genuine zero-km car.
alter table public.vehicles alter column mileage drop not null;

-- Dealer-entered vehicles are trusted (default true); imports set this false
-- until the dealer confirms, so the UI can mark the value unverified rather
-- than presenting a guess as fact. `condition` itself stays NOT NULL, so the
-- enum default still applies -- this column is what says "don't believe it yet".
alter table public.vehicles
  add column if not exists condition_confirmed boolean not null default true;

comment on column public.vehicles.mileage is
  'Kilometraje. NULL = no declarado por la fuente; 0 = cero real.';
comment on column public.vehicles.condition_confirmed is
  'False cuando la condicion no fue declarada por la fuente (SuperCarros no publica ninguna) y falta que el dealer la confirme.';
