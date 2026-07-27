-- Applied live via Supabase MCP; kept here for repo parity.
create table if not exists public.financing_info_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  bank_id uuid not null references public.banks(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_fields text[] not null,
  custom_message text,
  urgency text not null default 'normal' check (urgency in ('normal','urgente')),
  due_date date,
  status text not null default 'abierta' check (status in ('abierta','completada','cancelada')),
  whatsapp_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists fin_info_req_app_idx
  on public.financing_info_requests (application_id, status, created_at desc);

alter table public.financing_info_requests enable row level security;

-- The CLIENT must be able to read this: it is what makes "Solicitado por el
-- banco" appear in their checklist. custom_message is written FOR the client, so
-- it is theirs to read -- unlike financing_internal_notes, which no buyer sees.
drop policy if exists fir_read on public.financing_info_requests;
create policy fir_read on public.financing_info_requests for select
  using (bank_id = auth_bank_id() or is_app_owner(application_id) or is_admin());

drop policy if exists fir_insert on public.financing_info_requests;
create policy fir_insert on public.financing_info_requests for insert
  with check (
    bank_id = auth_bank_id()
    and exists (select 1 from public.application_banks ab
                where ab.application_id = financing_info_requests.application_id
                  and ab.bank_id = financing_info_requests.bank_id)
  );

drop policy if exists fir_update on public.financing_info_requests;
create policy fir_update on public.financing_info_requests for update
  using (bank_id = auth_bank_id() or is_admin())
  with check (bank_id = auth_bank_id() or is_admin());

grant select, insert, update on public.financing_info_requests to authenticated;

-- Creating a request also lands the document-type items in `documents`, so the
-- client's existing upload UI works on them, and logs the event. One
-- transaction: a request can never exist without its documents or its audit
-- entry.
create or replace function public.bank_request_info(
  p_application_id uuid,
  p_fields text[],
  p_message text default null,
  p_urgency text default 'normal',
  p_due_date date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bank uuid := auth_bank_id();
  v_id uuid; v_actor text; v_field text; v_doc_label text;
  -- Real uploads; the rest are profile/KYC items the client completes in their
  -- own account rather than by attaching a file.
  v_doc_fields text[] := array['comprobante_ingresos','referencias','info_laboral','inicial_disponible','otro'];
begin
  if v_bank is null then raise exception 'not a bank user'; end if;
  if p_fields is null or array_length(p_fields, 1) is null then
    raise exception 'selecciona al menos un dato';
  end if;
  if not exists (select 1 from application_banks ab
                 where ab.application_id = p_application_id and ab.bank_id = v_bank) then
    raise exception 'application not routed to this bank';
  end if;

  select coalesce(full_name, 'Banco') into v_actor from profiles where id = auth.uid();

  insert into financing_info_requests(application_id, bank_id, requested_by, requested_fields,
                                      custom_message, urgency, due_date)
  values (p_application_id, v_bank, auth.uid(), p_fields,
          nullif(btrim(coalesce(p_message,'')),''), coalesce(p_urgency,'normal'), p_due_date)
  returning id into v_id;

  foreach v_field in array p_fields loop
    if v_field = any(v_doc_fields) then
      v_doc_label := case v_field
        when 'comprobante_ingresos' then 'Comprobante de ingresos'
        when 'referencias' then 'Referencias'
        when 'info_laboral' then 'Información laboral'
        when 'inicial_disponible' then 'Comprobante de inicial'
        else 'Otro documento' end;
      insert into documents(application_id, requested_by_bank, doc_type, status, notes, requested_at)
      values (p_application_id, v_bank, v_doc_label, 'solicitado',
              nullif(btrim(coalesce(p_message,'')),''), now());
    end if;
  end loop;

  insert into financing_events(application_id, actor, kind, detail, meta)
  values (p_application_id, v_actor, 'info_requested', 'Información solicitada al cliente',
          jsonb_build_object('bank_id', v_bank, 'fields', to_jsonb(p_fields),
                             'urgency', coalesce(p_urgency,'normal'), 'request_id', v_id));

  return v_id;
end $$;

revoke all on function public.bank_request_info(uuid, text[], text, text, date) from public, anon;
grant execute on function public.bank_request_info(uuid, text[], text, text, date) to authenticated;
