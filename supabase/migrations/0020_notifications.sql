-- ============================================================
-- AutoRD in-app notifications (bell)
-- Bank responses notify the buyer AND the dealer. Owner-only RLS; notify_bank_
-- response() is SECURITY DEFINER and only the responding bank (or admin) may call
-- it, so it can write into the buyer's/dealer's notifications. Complements the
-- existing WhatsApp ping (wa-notify).
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_profile on public.notifications (profile_id, read, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notifications_owner_read on public.notifications;
create policy notifications_owner_read on public.notifications for select to authenticated using (profile_id = auth.uid());
drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function public.my_notifications(p_limit int default 30) returns setof public.notifications
language sql stable security definer set search_path=public as $$
  select * from public.notifications where profile_id=auth.uid() order by created_at desc limit p_limit;
$$;
grant execute on function public.my_notifications(int) to authenticated;

create or replace function public.my_unread_count() returns int
language sql stable security definer set search_path=public as $$
  select count(*)::int from public.notifications where profile_id=auth.uid() and not read;
$$;
grant execute on function public.my_unread_count() to authenticated;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path=public as $$
  update public.notifications set read=true where profile_id=auth.uid() and not read;
$$;
grant execute on function public.mark_notifications_read() to authenticated;

create or replace function public.notify_bank_response(p_response_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  r_status text; r_app uuid; r_bank uuid;
  a_buyer uuid; a_dealer uuid; bank_name text; label text;
begin
  select ab.status, ab.application_id, ab.bank_id into r_status, r_app, r_bank
  from public.application_banks ab where ab.id = p_response_id;
  if r_app is null then return; end if;

  if not (public.is_admin() or exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.bank_id=r_bank
  )) then return; end if;

  select fa.buyer_id, fa.dealer_id into a_buyer, a_dealer
  from public.financing_applications fa where fa.id = r_app;
  select name into bank_name from public.banks where id = r_bank;

  label := case r_status
    when 'preaprobada' then 'te pre-aprobó'
    when 'oferta' then 'envió una oferta'
    when 'aprobada' then 'aprobó tu solicitud'
    when 'en_evaluacion' then 'está evaluando tu solicitud'
    when 'pendiente_docs' then 'solicita documentos'
    when 'rechazada' then 'no pudo aprobar tu solicitud'
    else 'respondió a tu solicitud' end;

  if a_buyer is not null then
    insert into public.notifications (profile_id, kind, title, body, link)
    values (a_buyer, 'bank_response', coalesce(bank_name,'Un banco') || ' ' || label,
      'Revisa las condiciones en tu financiamiento.', '/mi-financiamiento');
  end if;

  if a_dealer is not null then
    insert into public.notifications (profile_id, kind, title, body, link)
    select p.id, 'bank_response', coalesce(bank_name,'Un banco') || ' ' || label,
      'Un banco respondió a la solicitud de un cliente.', '/dealer/leads'
    from public.profiles p where p.dealer_id = a_dealer and p.role='dealer';
  end if;
end $$;
grant execute on function public.notify_bank_response(uuid) to authenticated;
