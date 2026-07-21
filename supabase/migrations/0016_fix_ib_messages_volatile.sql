-- ============================================================
-- Fix: wa_ib_messages (from 0010) was declared STABLE but marks the conversation
-- read via an UPDATE. Postgres rejects writes in a non-volatile function
-- ("UPDATE is not allowed in a non-volatile function"), so the inbox chat never
-- loaded any messages. Recreate it VOLATILE.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create or replace function public.wa_ib_messages(p_conversation uuid)
returns setof wa_messages
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare k text; i uuid;
begin
  select kind, id into k, i from public._wa_owner();
  if i is null then raise exception 'no_owner'; end if;
  if not exists (select 1 from public.wa_conversations c where c.id=p_conversation and c.owner_kind=k and c.owner_id=i) then raise exception 'not_found'; end if;
  update public.wa_conversations set unread=0 where id=p_conversation;
  return query select * from public.wa_messages where conversation_id=p_conversation order by created_at asc limit 500;
end $$;
