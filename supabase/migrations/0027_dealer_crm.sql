-- Dealer CRM: pipeline fields on WhatsApp conversations + enriched lead RPCs.
alter table wa_conversations add column if not exists stage text not null default 'nuevo';
alter table wa_conversations add column if not exists salesperson text;
alter table wa_conversations add column if not exists follow_up_at timestamptz;
alter table wa_conversations add column if not exists notes text;
alter table wa_conversations add column if not exists vehicle_id uuid references vehicles(id) on delete set null;

-- start_dealer_chat: also record which vehicle the customer asked about.
create or replace function start_dealer_chat(p_vehicle_slug text, p_phone text, p_name text, p_text text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare d_id uuid; v_id uuid; conv_id uuid; phone text; msg text; nm text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  phone := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(phone) < 10 then raise exception 'invalid_phone'; end if;
  msg := nullif(btrim(coalesce(p_text,'')), '');
  if msg is null then raise exception 'empty_message'; end if;
  nm := nullif(btrim(coalesce(p_name,'')), '');

  select v.dealer_id, v.id into d_id, v_id from public.vehicles v where v.slug = p_vehicle_slug limit 1;
  if d_id is null then raise exception 'dealer_not_found'; end if;

  select id into conv_id from public.wa_conversations
    where owner_kind='dealer' and owner_id=d_id and wa_phone=phone limit 1;
  if conv_id is null then
    insert into public.wa_conversations (owner_kind, owner_id, wa_phone, wa_name, customer_id, unread, last_message_at, last_text, last_direction, vehicle_id, stage)
    values ('dealer', d_id, phone, nm, auth.uid(), 1, now(), left(msg,500), 'in', v_id, 'nuevo')
    returning id into conv_id;
  else
    update public.wa_conversations
      set unread = unread + 1, last_message_at = now(), last_text = left(msg,500), last_direction='in',
          wa_name = coalesce(wa_name, nm), customer_id = coalesce(customer_id, auth.uid()),
          vehicle_id = coalesce(vehicle_id, v_id)
      where id = conv_id;
  end if;

  insert into public.wa_messages (owner_kind, owner_id, conversation_id, direction, body, status)
  values ('dealer', d_id, conv_id, 'in', msg, 'received');

  return conv_id;
end $$;

-- Enriched leads for the dealer CRM (joins vehicle + customer KYC status; biometrics never exposed).
drop function if exists wa_ib_leads();
create function wa_ib_leads()
returns table (
  id uuid, wa_phone text, wa_name text, customer_id uuid,
  stage text, salesperson text, follow_up_at timestamptz, notes text,
  unread int, last_message_at timestamptz, last_text text, created_at timestamptz,
  vehicle_id uuid, vehicle_make text, vehicle_model text, vehicle_year int, vehicle_slug text, vehicle_price numeric, vehicle_currency text,
  kyc_verified_at timestamptz
) language plpgsql stable security definer set search_path to 'public' as $$
declare k text; i uuid;
begin
  select o.kind, o.id into k, i from public._wa_owner() o;
  if i is null then raise exception 'no_owner'; end if;
  return query
    select c.id, c.wa_phone, c.wa_name, c.customer_id,
           coalesce(c.stage,'nuevo'), c.salesperson, c.follow_up_at, c.notes,
           c.unread, c.last_message_at, c.last_text, c.created_at,
           c.vehicle_id, v.make, v.model, v.year, v.slug, v.price, v.currency,
           p.kyc_verified_at
    from public.wa_conversations c
    left join public.vehicles v on v.id = c.vehicle_id
    left join public.profiles p on p.id = c.customer_id
    where c.owner_kind=k and c.owner_id=i
    order by c.last_message_at desc nulls last
    limit 200;
end $$;

-- Update a lead's CRM fields (owner-scoped). Null args leave a field unchanged.
create or replace function wa_ib_update_lead(p_conversation uuid, p_stage text default null, p_salesperson text default null, p_notes text default null, p_follow_up timestamptz default null, p_clear_follow boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
declare k text; i uuid;
begin
  select o.kind, o.id into k, i from public._wa_owner() o;
  if i is null then raise exception 'no_owner'; end if;
  update public.wa_conversations
    set stage = coalesce(nullif(p_stage,''), stage),
        salesperson = case when p_salesperson is not null then nullif(p_salesperson,'') else salesperson end,
        notes = case when p_notes is not null then p_notes else notes end,
        follow_up_at = case when p_clear_follow then null when p_follow_up is not null then p_follow_up else follow_up_at end
    where id = p_conversation and owner_kind=k and owner_id=i;
end $$;

grant execute on function wa_ib_leads() to authenticated;
grant execute on function wa_ib_update_lead(uuid, text, text, text, timestamptz, boolean) to authenticated;
