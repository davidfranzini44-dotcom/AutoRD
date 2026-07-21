-- ============================================================
-- AutoRD richer dealer profile
-- A short description, a star rating (avg + count), and the founding year for
-- the public dealer profile. Ratings would come from buyer reviews in
-- production; the seeds below just make the profile read well. Dealers edit the
-- description from their console (see updateDealerProfile).
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

alter table public.dealers
  add column if not exists description text,
  add column if not exists rating numeric(2,1),
  add column if not exists rating_count integer not null default 0,
  add column if not exists founded_year integer;

update public.dealers set
  description = coalesce(description, 'Concesionario de vehículos con inventario verificado y financiamiento disponible a través de AutoRD. Atención personalizada y unidades revisadas.'),
  rating = coalesce(rating, 4.7),
  rating_count = case when rating_count = 0 then 128 else rating_count end,
  founded_year = coalesce(founded_year, 2015)
where slug = 'auto-america';

update public.dealers set
  description = coalesce(description, 'Importadora directa con más de una década trayendo vehículos de calidad al país. Cada unidad pasa por inspección antes de publicarse.'),
  rating = coalesce(rating, 4.5),
  rating_count = case when rating_count = 0 then 86 else rating_count end,
  founded_year = coalesce(founded_year, 2012)
where slug = 'autoimport-srl';

update public.dealers set
  description = coalesce(description, 'Tu dealer de confianza en el Cibao. Amplia variedad de SUVs y camionetas con opciones de financiamiento para todos los bancos.'),
  rating = coalesce(rating, 4.8),
  rating_count = case when rating_count = 0 then 203 else rating_count end,
  founded_year = coalesce(founded_year, 2017)
where slug = 'top-auto-rd';
