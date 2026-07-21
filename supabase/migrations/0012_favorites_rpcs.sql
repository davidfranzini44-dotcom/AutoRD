-- ============================================================
-- AutoRD saved-cars (favorites) RPCs
-- The marketplace UI keys vehicles by slug, but favorites.vehicle_id is a uuid.
-- These SECURITY DEFINER RPCs bridge slug <-> uuid so a logged-in buyer's saved
-- cars persist to their account (and follow them across devices), while RLS
-- still isolates each user's rows. Granted to authenticated only.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create or replace function public.toggle_favorite(p_slug text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare vid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into vid from public.vehicles where slug = p_slug limit 1;
  if vid is null then raise exception 'vehicle_not_found'; end if;
  if exists (select 1 from public.favorites where profile_id = auth.uid() and vehicle_id = vid) then
    delete from public.favorites where profile_id = auth.uid() and vehicle_id = vid;
    return false;
  else
    insert into public.favorites (profile_id, vehicle_id) values (auth.uid(), vid) on conflict do nothing;
    return true;
  end if;
end $$;

create or replace function public.my_favorite_slugs()
returns setof text
language sql
stable security definer
set search_path to 'public'
as $$
  select v.slug from public.favorites f join public.vehicles v on v.id = f.vehicle_id
  where f.profile_id = auth.uid() order by f.created_at desc;
$$;

revoke all on function public.toggle_favorite(text) from anon;
revoke all on function public.my_favorite_slugs() from anon;
grant execute on function public.toggle_favorite(text) to authenticated;
grant execute on function public.my_favorite_slugs() to authenticated;
