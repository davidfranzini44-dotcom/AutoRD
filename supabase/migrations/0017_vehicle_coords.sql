-- ============================================================
-- AutoRD per-vehicle coordinates
-- A car sits at its dealer's location, so cars can render precisely on a map
-- (not just by city). Existing inventory is backfilled from the dealer's primary
-- branch; new listings capture the chosen branch's coords (see PostVehicle).
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

alter table public.vehicles
  add column if not exists lat numeric,
  add column if not exists lng numeric;

update public.vehicles v set
  lat = (d.locations->0->>'lat')::numeric,
  lng = (d.locations->0->>'lng')::numeric
from public.dealers d
where v.dealer_id = d.id
  and v.lat is null
  and d.locations->0->>'lat' is not null
  and d.locations->0->>'lng' is not null;
