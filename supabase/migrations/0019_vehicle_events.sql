-- ============================================================
-- AutoRD dealer lead tracking
-- Records vehicle views, shares, contact (WhatsApp) clicks and financing clicks
-- so dealers can see engagement. track_event() is a public SECURITY DEFINER entry
-- point (anon buyers included); reads are dealer-owner/admin only via RLS.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create table if not exists public.vehicle_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  dealer_id uuid references public.dealers(id) on delete set null,
  kind text not null check (kind in ('view','share','contact','financing')),
  profile_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_vehicle_events_dealer on public.vehicle_events (dealer_id, kind, created_at desc);
create index if not exists idx_vehicle_events_vehicle on public.vehicle_events (vehicle_id, kind);

alter table public.vehicle_events enable row level security;
drop policy if exists vehicle_events_read on public.vehicle_events;
create policy vehicle_events_read on public.vehicle_events for select to authenticated
  using (dealer_id = public.auth_dealer_id() or public.is_admin());

create or replace function public.track_event(p_slug text, p_kind text) returns void
language plpgsql security definer set search_path=public as $$
declare vid uuid; did uuid;
begin
  if p_kind not in ('view','share','contact','financing') then return; end if;
  select id, dealer_id into vid, did from public.vehicles where slug=p_slug limit 1;
  if vid is null then return; end if;
  insert into public.vehicle_events (vehicle_id, dealer_id, kind, profile_id)
  values (vid, did, p_kind, auth.uid());
end $$;
grant execute on function public.track_event(text,text) to anon, authenticated;

create or replace function public.my_dealer_lead_counts() returns table(kind text, total bigint)
language sql stable security definer set search_path=public as $$
  select e.kind, count(*)::bigint from public.vehicle_events e
  where e.dealer_id = public.auth_dealer_id()
  group by e.kind;
$$;
grant execute on function public.my_dealer_lead_counts() to authenticated;

create or replace function public.my_dealer_vehicle_events() returns table(vehicle_id uuid, kind text, total bigint)
language sql stable security definer set search_path=public as $$
  select e.vehicle_id, e.kind, count(*)::bigint from public.vehicle_events e
  where e.dealer_id = public.auth_dealer_id()
  group by e.vehicle_id, e.kind;
$$;
grant execute on function public.my_dealer_vehicle_events() to authenticated;
