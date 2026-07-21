-- ============================================================
-- AutoRD cross-device persistence: recently-viewed vehicles + saved search alerts
-- localStorage stays as the instant cache; these tables let logged-in buyers'
-- history + alerts follow them across devices. Owner-only RLS; SECURITY DEFINER
-- RPCs bridge the slug-keyed UI to the uuid `vehicles` table.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create table if not exists public.recently_viewed (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (profile_id, vehicle_id)
);
alter table public.recently_viewed enable row level security;
drop policy if exists recently_viewed_owner on public.recently_viewed;
create policy recently_viewed_owner on public.recently_viewed for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create index if not exists idx_recently_viewed_profile_time on public.recently_viewed (profile_id, viewed_at desc);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  query text not null,
  filters jsonb not null default '[]'::jsonb,
  count int not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (profile_id, query)
);
alter table public.saved_searches enable row level security;
drop policy if exists saved_searches_owner on public.saved_searches;
create policy saved_searches_owner on public.saved_searches for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function public.record_view(p_slug text) returns void
language plpgsql security definer set search_path=public as $$
declare vid uuid;
begin
  if auth.uid() is null then return; end if;
  select id into vid from public.vehicles where slug=p_slug limit 1;
  if vid is null then return; end if;
  insert into public.recently_viewed (profile_id, vehicle_id, viewed_at)
  values (auth.uid(), vid, now())
  on conflict (profile_id, vehicle_id) do update set viewed_at=now();
  delete from public.recently_viewed r
  where r.profile_id=auth.uid()
    and r.vehicle_id not in (
      select vehicle_id from public.recently_viewed where profile_id=auth.uid() order by viewed_at desc limit 24
    );
end $$;

create or replace function public.my_recent_slugs() returns setof text
language sql stable security definer set search_path=public as $$
  select v.slug from public.recently_viewed r join public.vehicles v on v.id=r.vehicle_id
  where r.profile_id=auth.uid() order by r.viewed_at desc limit 24;
$$;

create or replace function public.save_search(p_query text, p_title text, p_filters jsonb, p_count int) returns uuid
language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.saved_searches (profile_id, title, query, filters, count, last_seen_at)
  values (auth.uid(), p_title, p_query, coalesce(p_filters,'[]'::jsonb), coalesce(p_count,0), now())
  on conflict (profile_id, query) do update set title=excluded.title, filters=excluded.filters, count=excluded.count, last_seen_at=now()
  returning id into sid;
  return sid;
end $$;

create or replace function public.my_saved_searches() returns setof public.saved_searches
language sql stable security definer set search_path=public as $$
  select * from public.saved_searches where profile_id=auth.uid() order by created_at desc limit 50;
$$;

create or replace function public.delete_saved_search_by_query(p_query text) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from public.saved_searches where query=p_query and profile_id=auth.uid();
end $$;

revoke all on function public.record_view(text) from anon;
revoke all on function public.my_recent_slugs() from anon;
revoke all on function public.save_search(text,text,jsonb,int) from anon;
revoke all on function public.my_saved_searches() from anon;
revoke all on function public.delete_saved_search_by_query(text) from anon;
grant execute on function public.record_view(text) to authenticated;
grant execute on function public.my_recent_slugs() to authenticated;
grant execute on function public.save_search(text,text,jsonb,int) to authenticated;
grant execute on function public.my_saved_searches() to authenticated;
grant execute on function public.delete_saved_search_by_query(text) to authenticated;
