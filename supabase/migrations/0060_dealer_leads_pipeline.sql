-- Applied live via Supabase MCP; kept here for repo parity.
--
-- A lead currently only exists if the buyer messaged on WhatsApp
-- (getDealerLeads -> wa_ib_leads, keyed on a conversation). A buyer who saved
-- cars, applied for financing and got pre-approved but never opened WhatsApp is
-- invisible to the dealer -- exactly the lead worth calling.
--
-- Same shape as bank_client_details: the SIGNAL is derived live from real
-- tables, and only the dealer's own work is stored.
create table if not exists public.dealer_leads (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  -- Dealer-controlled stages ONLY. Pre-aprobado / Aprobado / En banco are the
  -- bank's decision: storing them here would let the pipeline contradict the
  -- bank, and a dealer cannot set them anyway. They are derived in
  -- dealer_pipeline() instead. The brief's nine stages mix two independent
  -- axes -- a buyer can be "contactado" AND "pre-aprobado" at once, and the
  -- most valuable lead of all is pre-approved but NOT yet contacted.
  stage text not null default 'nuevo'
    check (stage in ('nuevo','contactado','negociando','separado','vendido','perdido')),
  salesperson_id uuid references public.profiles(id) on delete set null,
  next_action text,
  next_action_date date,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (dealer_id, buyer_id)
);

alter table public.dealer_leads enable row level security;

drop policy if exists dl_rw on public.dealer_leads;
create policy dl_rw on public.dealer_leads for all
  using (dealer_id = auth_dealer_id() or is_admin())
  with check (dealer_id = auth_dealer_id() or is_admin());

grant select, insert, update on public.dealer_leads to authenticated;

-- Every buyer with real intent toward THIS dealer's stock, whether or not they
-- ever sent a message. Financing state is derived per lead and never stored,
-- and carries only what a dealer may know: amounts and status, never bank
-- notes, risk flags or rejection reasoning.
--
-- preapproval_interests keys on (application_id, vehicle_id, dealer_id); the
-- buyer is reached through the application.
create or replace function public.dealer_pipeline(p_dealer uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  if p_dealer is null or (p_dealer <> auth_dealer_id() and not is_admin()) then
    raise exception 'not this dealer';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.last_activity desc nulls last), '[]'::jsonb)
    into v_out
  from (
    select
      b.buyer_id,
      p.full_name as customer,
      p.phone     as phone,
      coalesce(dl.stage, 'nuevo') as dealer_stage,
      dl.salesperson_id,
      sp.full_name as salesperson,
      dl.next_action, dl.next_action_date,
      b.vehicle_id,
      case when v.id is null then null
           else v.make || ' ' || v.model || ' ' || v.year::text end as vehicle,
      v.price as vehicle_price,
      b.source,
      b.last_activity,
      fa.id          as application_id,
      fa.status::text as app_status,
      (select max(ab.approved_amount) from application_banks ab
        where ab.application_id = fa.id
          and ab.status in ('preaprobada','oferta','condicional')
          and (ab.valid_until is null or ab.valid_until >= current_date)) as approved_amount,
      (select min(ab.valid_until) from application_banks ab
        where ab.application_id = fa.id
          and ab.status in ('preaprobada','oferta','condicional')
          and ab.valid_until is not null) as approval_valid_until,
      exists (select 1 from application_banks ab
               where ab.application_id = fa.id and ab.status = 'pendiente_docs') as needs_docs,
      exists (select 1 from application_banks ab
               where ab.application_id = fa.id and ab.status = 'en_evaluacion') as in_bank,
      fa.kyc_status::text as kyc_status
    from (
      select fa1.buyer_id, pi.vehicle_id, 'marketplace'::text as source, max(pi.created_at) as last_activity
      from preapproval_interests pi
      join financing_applications fa1 on fa1.id = pi.application_id
      where pi.dealer_id = p_dealer
      group by fa1.buyer_id, pi.vehicle_id
      union
      select fa2.buyer_id, fa2.vehicle_id, 'vehiculo'::text, max(fa2.created_at)
      from financing_applications fa2
      left join vehicles vv2 on vv2.id = fa2.vehicle_id
      where fa2.dealer_id = p_dealer or vv2.dealer_id = p_dealer
      group by fa2.buyer_id, fa2.vehicle_id
    ) b
    join profiles p on p.id = b.buyer_id
    left join vehicles v on v.id = b.vehicle_id
    left join dealer_leads dl on dl.dealer_id = p_dealer and dl.buyer_id = b.buyer_id
    left join profiles sp on sp.id = dl.salesperson_id
    left join lateral (
      select fa3.* from financing_applications fa3
      where fa3.buyer_id = b.buyer_id
      order by fa3.created_at desc limit 1
    ) fa on true
  ) x;

  return v_out;
end $$;

revoke all on function public.dealer_pipeline(uuid) from public, anon;
grant execute on function public.dealer_pipeline(uuid) to authenticated;
