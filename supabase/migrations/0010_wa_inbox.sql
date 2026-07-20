-- AutoRD — multi-tenant WhatsApp inbox for dealers & banks.
-- Each dealer/bank links its OWN WhatsApp number and chats with customers.
-- Served by AutoRD's own worker (autord-wa-worker, multi-tenant). All data
-- lives here, isolated per owner. (Separate from the platform OTP sender in 0007.)

-- ---------------------------------------------------------------------------
-- Tables (owner = a dealer or a bank)
-- ---------------------------------------------------------------------------
create table if not exists public.wa_connections (
  id            uuid primary key default gen_random_uuid(),
  owner_kind    text not null check (owner_kind in ('dealer', 'bank')),
  owner_id      uuid not null,
  provider      text not null default 'baileys',
  enabled       boolean not null default false,
  status        text not null default 'disconnected', -- disconnected|connecting|qr|pairing|connected|logout
  pairing_phone text,
  pairing_code  text,
  qr            text,
  phone_number  text,
  worker_error  text,
  connected_at  timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_kind, owner_id)
);

create table if not exists public.wa_conversations (
  id              uuid primary key default gen_random_uuid(),
  owner_kind      text not null check (owner_kind in ('dealer', 'bank')),
  owner_id        uuid not null,
  wa_phone        text not null,        -- customer digits
  wa_jid          text,
  wa_name         text,
  customer_id     uuid,                 -- optional link to a buyer profile
  status          text not null default 'open',
  unread          int  not null default 0,
  last_message_at timestamptz,
  last_text       text,
  last_direction  text,                 -- in|out
  created_at      timestamptz not null default now(),
  unique (owner_kind, owner_id, wa_phone)
);
create index if not exists wa_conversations_owner on public.wa_conversations (owner_kind, owner_id, last_message_at desc);

create table if not exists public.wa_messages (
  id              uuid primary key default gen_random_uuid(),
  owner_kind      text not null check (owner_kind in ('dealer', 'bank')),
  owner_id        uuid not null,
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  direction       text not null check (direction in ('in', 'out')),
  body            text,
  status          text not null default 'queued', -- out: queued|sending|sent|failed ; in: received
  error           text,
  attempts        int not null default 0,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists wa_messages_conv on public.wa_messages (conversation_id, created_at);
create index if not exists wa_messages_out_queue on public.wa_messages (status, created_at) where direction = 'out';

-- ---------------------------------------------------------------------------
-- RLS: deny-all; the worker uses service_role, the panels use the RPCs below.
-- ---------------------------------------------------------------------------
alter table public.wa_connections   enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages       enable row level security;

-- Who is the caller (dealer or bank)?
create or replace function public._wa_owner(out kind text, out id uuid)
language plpgsql stable security definer set search_path = public as $$
declare r text; did uuid; bid uuid;
begin
  select p.role, p.dealer_id, p.bank_id into r, did, bid from public.profiles p where p.id = auth.uid();
  if r = 'dealer' and did is not null then kind := 'dealer'; id := did;
  elsif r = 'bank' and bid is not null then kind := 'bank'; id := bid;
  else kind := null; id := null; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Panel RPCs (owner-scoped)
-- ---------------------------------------------------------------------------
create or replace function public.wa_ib_status()
returns setof public.wa_connections language plpgsql security definer set search_path = public as $$
declare k text; i uuid;
begin
  select kind, id into k, i from public._wa_owner();
  if i is null then raise exception 'no_owner'; end if;
  insert into public.wa_connections (owner_kind, owner_id) values (k, i)
    on conflict (owner_kind, owner_id) do nothing;
  return query select * from public.wa_connections where owner_kind = k and owner_id = i;
end $$;

create or replace function public.wa_ib_link()
returns void language plpgsql security definer set search_path = public as $$
declare k text; i uuid;
begin
  select kind, id into k, i from public._wa_owner();
  if i is null then raise exception 'no_owner'; end if;
  insert into public.wa_connections (owner_kind, owner_id) values (k, i) on conflict (owner_kind, owner_id) do nothing;
  update public.wa_connections set enabled = true, provider = 'baileys', status = 'connecting',
         pairing_phone = null, pairing_code = null, qr = null, worker_error = null, updated_at = now()
   where owner_kind = k and owner_id = i;
end $$;

create or replace function public.wa_ib_pair(p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare k text; i uuid; d text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
begin
  select kind, id into k, i from public._wa_owner();
  if i is null then raise exception 'no_owner'; end if;
  if length(d) < 10 then raise exception 'invalid phone'; end if;
  insert into public.wa_connections (owner_kind, owner_id) values (k, i) on conflict (owner_kind, owner_id) do nothing;
  update public.wa_connections set enabled = true, provider = 'baileys', status = 'pairing',
         pairing_phone = d, pairing_code = null, qr = null, worker_error = null, updated_at = now()
   where owner_kind = k and owner_id = i;
end $$;

create or replace function public.wa_ib_disconnect()
returns void language plpgsql security definer set search_path = public as $$
declare k text; i uuid;
begin
  select kind, id into k, i from public._wa_owner();
  if i is null then raise exception 'no_owner'; end if;
  -- 'logout' tells the worker to unlink the device, then it resets the row.
  update public.wa_connections set status = 'logout', enabled = false, updated_at = now()
   where owner_kind = k and owner_id = i;
end $$;

create or replace function public.wa_ib_conversations()
returns setof public.wa_conversations language plpgsql stable security definer set search_path = public as $$
declare k text; i uuid;
begin
  select kind, id into k, i from public._wa_owner();
  if i is null then raise exception 'no_owner'; end if;
  return query select * from public.wa_conversations where owner_kind = k and owner_id = i order by last_message_at desc nulls last limit 100;
end $$;

create or replace function public.wa_ib_messages(p_conversation uuid)
returns setof public.wa_messages language plpgsql stable security definer set search_path = public as $$
declare k text; i uuid;
begin
  select kind, id into k, i from public._wa_owner();
  if i is null then raise exception 'no_owner'; end if;
  if not exists (select 1 from public.wa_conversations c where c.id = p_conversation and c.owner_kind = k and c.owner_id = i) then
    raise exception 'not_found'; end if;
  update public.wa_conversations set unread = 0 where id = p_conversation;
  return query select * from public.wa_messages where conversation_id = p_conversation order by created_at asc limit 500;
end $$;

create or replace function public.wa_ib_send(p_conversation uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare k text; i uuid; mid uuid; b text := btrim(coalesce(p_body,''));
begin
  select kind, id into k, i from public._wa_owner();
  if i is null then raise exception 'no_owner'; end if;
  if b = '' then raise exception 'empty'; end if;
  if not exists (select 1 from public.wa_conversations c where c.id = p_conversation and c.owner_kind = k and c.owner_id = i) then
    raise exception 'not_found'; end if;
  insert into public.wa_messages (owner_kind, owner_id, conversation_id, direction, body, status, created_by)
    values (k, i, p_conversation, 'out', b, 'queued', auth.uid()) returning id into mid;
  update public.wa_conversations set last_message_at = now(), last_text = b, last_direction = 'out' where id = p_conversation;
  return mid;
end $$;

-- Worker: atomically claim queued outbound messages (service_role only).
create or replace function public.wa_ib_claim_out(p_limit int default 10)
returns setof public.wa_messages language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.wa_messages m set status = 'sending', attempts = attempts + 1
  where m.id in (
    select id from public.wa_messages where direction = 'out' and status = 'queued'
    order by created_at limit greatest(1, p_limit) for update skip locked
  ) returning m.*;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.wa_ib_claim_out(int) from public, anon, authenticated;
grant  execute on function public.wa_ib_claim_out(int) to service_role;

grant execute on function public.wa_ib_status()            to authenticated, service_role;
grant execute on function public.wa_ib_link()              to authenticated, service_role;
grant execute on function public.wa_ib_pair(text)          to authenticated, service_role;
grant execute on function public.wa_ib_disconnect()        to authenticated, service_role;
grant execute on function public.wa_ib_conversations()     to authenticated, service_role;
grant execute on function public.wa_ib_messages(uuid)      to authenticated, service_role;
grant execute on function public.wa_ib_send(uuid, text)    to authenticated, service_role;
