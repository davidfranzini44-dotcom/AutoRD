-- AutoRD — WhatsApp (Baileys) OTP + platform sender
-- Single-tenant: ONE platform WhatsApp number (the operator's), paired via the
-- super-admin panel, used to send verification codes. A separate always-on
-- worker (autord-wa-worker) polls these tables with the service_role key and
-- talks to WhatsApp — nothing here reaches the internet directly.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- The platform WhatsApp connection. Exactly one row ('platform'); the worker
-- writes status/qr/pairing_code, the admin panel reads them.
create table if not exists public.wa_connection (
  id            text primary key default 'platform',
  enabled       boolean not null default false,
  provider      text not null default 'baileys',
  status        text not null default 'disconnected', -- disconnected|connecting|qr|pairing|connected
  pairing_phone text,          -- set when linking by phone (pairing code) instead of QR
  pairing_code  text,          -- 8-char code the operator types on their phone
  qr            text,          -- data: URL PNG, present only while status='qr'
  phone_number  text,          -- the linked sender number once connected
  worker_error  text,
  connected_at  timestamptz,
  last_seen_at  timestamptz,
  updated_at    timestamptz not null default now(),
  constraint wa_connection_single check (id = 'platform')
);
insert into public.wa_connection (id) values ('platform') on conflict do nothing;

-- Outbound message queue. The worker drains rows in 'queued' state.
create table if not exists public.wa_outbox (
  id         uuid primary key default gen_random_uuid(),
  to_phone   text not null,                 -- digits only, no '+'
  body       text not null,
  status     text not null default 'queued', -- queued|sending|sent|failed
  attempts   int  not null default 0,
  error      text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wa_outbox_status_idx on public.wa_outbox (status, created_at);

-- Phone OTP challenges — only the hash is stored.
create table if not exists public.phone_otps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  phone      text not null,
  code_hash  text not null,
  purpose    text not null default 'claim',
  attempts   int  not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists phone_otps_lookup on public.phone_otps (phone, created_at desc);

-- Once verified, remember it on the profile (so the pre-approval is "claimed").
alter table public.profiles add column if not exists phone_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- RLS — lock everything; only service_role (worker + edge fns) and the
-- admin-guarded RPCs below may touch these tables.
-- ---------------------------------------------------------------------------
alter table public.wa_connection enable row level security;
alter table public.wa_outbox     enable row level security;
alter table public.phone_otps    enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Worker RPC: atomically claim queued messages (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.wa_claim_outbox(p_limit int default 5)
returns setof public.wa_outbox
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.wa_outbox o
     set status = 'sending', attempts = attempts + 1
   where o.id in (
     select id from public.wa_outbox
      where status = 'queued'
      order by created_at
      limit greatest(1, p_limit)
      for update skip locked
   )
  returning o.*;
end $$;

-- ---------------------------------------------------------------------------
-- Admin RPCs (super-admin panel). All guarded by is_platform_admin().
-- ---------------------------------------------------------------------------
create or replace function public.wa_connection_status()
returns public.wa_connection
language plpgsql stable security definer set search_path = public as $$
declare r public.wa_connection;
begin
  if not is_platform_admin() then raise exception 'not authorized'; end if;
  select * into r from public.wa_connection where id = 'platform';
  return r;
end $$;

-- Link via QR: worker will emit a QR the admin scans.
create or replace function public.wa_baileys_link()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not authorized'; end if;
  update public.wa_connection
     set enabled = true, provider = 'baileys', status = 'connecting',
         pairing_phone = null, pairing_code = null, qr = null, worker_error = null,
         updated_at = now()
   where id = 'platform';
end $$;

-- Link via phone (pairing code, no QR). p_phone = digits incl. country code.
create or replace function public.wa_start_pairing(p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
begin
  if not is_platform_admin() then raise exception 'not authorized'; end if;
  if length(d) < 10 then raise exception 'invalid phone'; end if;
  update public.wa_connection
     set enabled = true, provider = 'baileys', status = 'pairing',
         pairing_phone = d, pairing_code = null, qr = null, worker_error = null,
         updated_at = now()
   where id = 'platform';
end $$;

create or replace function public.wa_disconnect()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not authorized'; end if;
  update public.wa_connection
     set enabled = false, status = 'disconnected',
         qr = null, pairing_code = null, pairing_phone = null, worker_error = null,
         updated_at = now()
   where id = 'platform';
end $$;

-- ---------------------------------------------------------------------------
-- Grants: revoke broad execute, re-grant intentionally.
-- ---------------------------------------------------------------------------
revoke execute on function public.wa_claim_outbox(int)     from public, anon, authenticated;
grant  execute on function public.wa_claim_outbox(int)     to   service_role;

revoke execute on function public.wa_connection_status()   from public, anon;
revoke execute on function public.wa_baileys_link()        from public, anon;
revoke execute on function public.wa_start_pairing(text)   from public, anon;
revoke execute on function public.wa_disconnect()          from public, anon;
grant  execute on function public.wa_connection_status()   to   authenticated, service_role;
grant  execute on function public.wa_baileys_link()        to   authenticated, service_role;
grant  execute on function public.wa_start_pairing(text)   to   authenticated, service_role;
grant  execute on function public.wa_disconnect()          to   authenticated, service_role;
