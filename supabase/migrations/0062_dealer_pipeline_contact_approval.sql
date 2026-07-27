-- AutoRD 0062 -- dealer pipeline contact + exact approval context
--
-- A dealer lead may come from a pre-approval interest or from a concrete
-- financing application. The previous pipeline read phone/name from profiles
-- only and then joined the buyer's latest application, which can hide the
-- contact saved on the application and show the wrong approval context.
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
      coalesce(nullif(p.full_name, ''), nullif(fa.buyer_name, ''), 'Cliente') as customer,
      coalesce(nullif(p.phone, ''), nullif(fa.buyer_phone, '')) as phone,
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
      fa.id as application_id,
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
      select buyer_id, application_id, vehicle_id,
             case when bool_or(source = 'vehiculo') then 'vehiculo' else 'marketplace' end as source,
             max(last_activity) as last_activity
      from (
        select fa1.buyer_id, fa1.id as application_id, pi.vehicle_id,
               'marketplace'::text as source, pi.created_at as last_activity
        from preapproval_interests pi
        join financing_applications fa1 on fa1.id = pi.application_id
        where pi.dealer_id = p_dealer
          and pi.status in ('activa', 'convertida')
        union all
        select fa2.buyer_id, fa2.id as application_id, fa2.vehicle_id,
               'vehiculo'::text as source, coalesce(fa2.vehicle_linked_at, fa2.created_at) as last_activity
        from financing_applications fa2
        left join vehicles vv2 on vv2.id = fa2.vehicle_id
        where fa2.dealer_id = p_dealer or vv2.dealer_id = p_dealer
      ) raw_intent
      group by buyer_id, application_id, vehicle_id
    ) b
    join financing_applications fa on fa.id = b.application_id
    join profiles p on p.id = b.buyer_id
    left join vehicles v on v.id = b.vehicle_id
    left join dealer_leads dl on dl.dealer_id = p_dealer and dl.buyer_id = b.buyer_id
    left join profiles sp on sp.id = dl.salesperson_id
  ) x;

  return v_out;
end $$;

revoke all on function public.dealer_pipeline(uuid) from public, anon;
grant execute on function public.dealer_pipeline(uuid) to authenticated;
