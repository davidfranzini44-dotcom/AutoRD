-- ============================================================
-- AutoRD buyer -> dealer chat (into the WhatsApp inbox)
-- A buyer contacts a dealer about a specific car; this seeds a conversation into
-- that dealer's multi-tenant WhatsApp inbox (owner_kind='dealer', owner_id=
-- dealers.id) as an inbound message. The dealer replies from the inbox and the
-- worker delivers the reply to the buyer's WhatsApp. SECURITY DEFINER so it can
-- write across the inbox tables while RLS still isolates each dealer's view.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create or replace function public.start_dealer_chat(p_vehicle_slug text, p_phone text, p_name text, p_text text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare d_id uuid; conv_id uuid; phone text; msg text; nm text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  phone := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(phone) < 10 then raise exception 'invalid_phone'; end if;
  msg := nullif(btrim(coalesce(p_text,'')), '');
  if msg is null then raise exception 'empty_message'; end if;
  nm := nullif(btrim(coalesce(p_name,'')), '');

  select v.dealer_id into d_id from public.vehicles v where v.slug = p_vehicle_slug limit 1;
  if d_id is null then raise exception 'dealer_not_found'; end if;

  select id into conv_id from public.wa_conversations
    where owner_kind='dealer' and owner_id=d_id and wa_phone=phone limit 1;
  if conv_id is null then
    insert into public.wa_conversations (owner_kind, owner_id, wa_phone, wa_name, customer_id, unread, last_message_at, last_text, last_direction)
    values ('dealer', d_id, phone, nm, auth.uid(), 1, now(), left(msg,500), 'in')
    returning id into conv_id;
  else
    update public.wa_conversations
      set unread = unread + 1, last_message_at = now(), last_text = left(msg,500), last_direction='in',
          wa_name = coalesce(wa_name, nm), customer_id = coalesce(customer_id, auth.uid())
      where id = conv_id;
  end if;

  insert into public.wa_messages (owner_kind, owner_id, conversation_id, direction, body, status)
  values ('dealer', d_id, conv_id, 'in', msg, 'received');

  return conv_id;
end $$;

revoke all on function public.start_dealer_chat(text,text,text,text) from anon;
grant execute on function public.start_dealer_chat(text,text,text,text) to authenticated;
