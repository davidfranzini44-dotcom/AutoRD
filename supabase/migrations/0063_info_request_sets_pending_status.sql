-- Applied live via Supabase MCP; kept here for repo parity.
--
-- Asking the client for something now moves this bank's own response to
-- "pendiente_docs" and its internal stage to "esperando_info", in the same
-- transaction as the request.
--
-- Before this, a bank could request documents and its own queue still showed the
-- file as Nueva or En evaluacion, with nothing saying it was waiting on the
-- client -- the analyst had to remember. The request and the state it implies
-- belong together.
--
-- The status move is guarded: it only applies to PRE-decision statuses. A bank
-- that already answered preaprobada / oferta / condicional / rechazada and then
-- asks for one more document must not have its decision silently erased, and the
-- client must not watch an approval disappear because paperwork was requested.
-- The internal stage is always safe to set: it only models pre-decision work.
create or replace function public.bank_request_info(
  p_application_id uuid,
  p_fields text[],
  p_message text default null,
  p_urgency text default 'normal',
  p_due_date date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bank uuid := auth_bank_id();
  v_id uuid; v_actor text; v_field text; v_doc_label text; v_moved boolean := false;
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

  update application_banks
     set underwriting_stage = 'esperando_info', stage_updated_at = now()
   where application_id = p_application_id and bank_id = v_bank;

  update application_banks
     set status = 'pendiente_docs'
   where application_id = p_application_id and bank_id = v_bank
     and status in ('pendiente', 'en_evaluacion');
  get diagnostics v_moved = row_count;

  insert into financing_events(application_id, actor, kind, detail, meta)
  values (p_application_id, v_actor, 'info_requested', 'Información solicitada al cliente',
          jsonb_build_object('bank_id', v_bank, 'fields', to_jsonb(p_fields),
                             'urgency', coalesce(p_urgency,'normal'), 'request_id', v_id,
                             'status_moved', v_moved));

  return v_id;
end $$;

revoke all on function public.bank_request_info(uuid, text[], text, text, date) from public, anon;
grant execute on function public.bank_request_info(uuid, text[], text, text, date) to authenticated;
