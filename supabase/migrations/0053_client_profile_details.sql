-- Client-declared profile details + per-bank private client info.
-- Applied live via Supabase MCP; kept here for repo parity.

-- 1. Client-declared profile fields (canonical, shared with every bank the
--    client consented to route to). Address is provincia + free text.
alter table public.profiles
  add column if not exists occupation   text,
  add column if not exists provincia    text,
  add column if not exists address_line text;

-- 2. SECURITY: restrict which columns a user may change on their own profile.
--    profiles_self_upd only checks (id = auth.uid()), and Postgres RLS does not
--    restrict columns -- `authenticated` held UPDATE on every column of profiles,
--    with no triggers guarding it. Every visitor gets an authenticated session
--    (signInAnonymously) and the anon key ships in the browser bundle, so any
--    visitor could set their own role='admin' (is_admin() then bypasses every
--    policy in this database) or bank_id=<a bank> (auth_bank_id() then exposes
--    that bank's applicants, cedulas included).
--    No client code has ever written to profiles, so narrowing this is a no-op
--    for the app. Edge functions use service_role and are unaffected.
revoke update on public.profiles from authenticated, anon;
grant  update (full_name, phone, email, occupation, provincia, address_line)
  on public.profiles to authenticated;

-- 3. Per-bank client details. A bank's own legwork stays private to that bank:
--    what BHD records is never visible to Popular, even on the same application.
create table if not exists public.bank_client_details (
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  bank_id        uuid not null references public.banks(id) on delete cascade,
  email          text,
  occupation     text,
  provincia      text,
  address_line   text,
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (application_id, bank_id)
);

alter table public.bank_client_details enable row level security;

-- Readable only by the owning bank's team (and admins). Deliberately NOT
-- readable by the buyer or the dealer.
drop policy if exists bcd_read on public.bank_client_details;
create policy bcd_read on public.bank_client_details for select
  using (bank_id = auth_bank_id() or is_admin());

-- A bank may only record details for an application actually routed to it,
-- which is the consent boundary.
drop policy if exists bcd_insert on public.bank_client_details;
create policy bcd_insert on public.bank_client_details for insert
  with check (
    bank_id = auth_bank_id()
    and exists (
      select 1 from public.application_banks ab
      where ab.application_id = bank_client_details.application_id
        and ab.bank_id = bank_client_details.bank_id
    )
  );

drop policy if exists bcd_update on public.bank_client_details;
create policy bcd_update on public.bank_client_details for update
  using (bank_id = auth_bank_id())
  with check (bank_id = auth_bank_id());

grant select, insert, update on public.bank_client_details to authenticated;
