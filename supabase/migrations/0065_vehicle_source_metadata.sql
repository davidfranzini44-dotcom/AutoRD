-- Track vehicles imported from external listing sources such as SuperCarros.
-- These columns let dealer imports preview/update existing vehicles instead of
-- creating duplicates on every sync.

alter table public.vehicles
  add column if not exists source text,
  add column if not exists source_id text,
  add column if not exists source_url text,
  add column if not exists source_imported_at timestamptz,
  add column if not exists source_last_synced_at timestamptz;

create unique index if not exists idx_vehicles_source_url
  on public.vehicles(source, source_url)
  where source is not null and source_url is not null;

create index if not exists idx_vehicles_source_id
  on public.vehicles(source, source_id)
  where source is not null and source_id is not null;
