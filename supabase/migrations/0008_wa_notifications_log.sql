-- AutoRD — history of WhatsApp messages AutoRD sent (OTP + notifications).
-- Needed because in gateway mode the actual queue lives in Reparando's project,
-- so we keep our own audit log here. OTP bodies are NOT stored (no codes).

create table if not exists public.wa_notifications (
  id             uuid primary key default gen_random_uuid(),
  type           text not null default 'other',  -- otp | test | bank_response | other
  to_phone       text not null,
  body           text,                            -- generic for OTP (never the code)
  status         text not null default 'sent',    -- sent (handed to gateway) | failed | queued
  via            text,                            -- reparando | autord
  user_id        uuid,
  application_id uuid,
  meta           jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists wa_notifications_created on public.wa_notifications (created_at desc);
create index if not exists wa_notifications_type on public.wa_notifications (type, created_at desc);

alter table public.wa_notifications enable row level security; -- service_role writes; admins read via RPC

-- Admin-only history with an OTP / Notifications category filter.
create or replace function public.wa_notifications_list(p_kind text default null, p_limit int default 50)
returns setof public.wa_notifications
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not authorized'; end if;
  return query
    select * from public.wa_notifications n
    where (p_kind is null
       or (p_kind = 'otp'   and n.type in ('otp', 'test'))
       or (p_kind = 'notif' and n.type not in ('otp', 'test')))
    order by n.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

revoke execute on function public.wa_notifications_list(text, int) from public, anon;
grant  execute on function public.wa_notifications_list(text, int) to authenticated, service_role;
