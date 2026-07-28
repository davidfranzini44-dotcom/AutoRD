-- "Pendiente documentos" must mean an actual document upload is missing.
--
-- Some applications can carry application_banks.status = pendiente_docs even
-- when no document was requested. Also, bank_request_info can request profile
-- fields such as occupation/address/email, which should move underwriting to
-- "esperando_info" without telling the client/dealer that documents are missing.

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
  v_has_doc_fields boolean := false;
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
  select exists(select 1 from unnest(p_fields) f where f = any(v_doc_fields)) into v_has_doc_fields;

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
        when 'info_laboral' then 'Informacion laboral'
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

  if v_has_doc_fields then
    update application_banks
       set status = 'pendiente_docs'
     where application_id = p_application_id and bank_id = v_bank
       and status in ('pendiente', 'en_evaluacion');
    get diagnostics v_moved = row_count;
  end if;

  insert into financing_events(application_id, actor, kind, detail, meta)
  values (p_application_id, v_actor, 'info_requested', 'Informacion solicitada al cliente',
          jsonb_build_object('bank_id', v_bank, 'fields', to_jsonb(p_fields),
                             'urgency', coalesce(p_urgency,'normal'), 'request_id', v_id,
                             'status_moved', v_moved, 'has_document_fields', v_has_doc_fields));

  return v_id;
end $$;

revoke all on function public.bank_request_info(uuid, text[], text, text, date) from public, anon;
grant execute on function public.bank_request_info(uuid, text[], text, text, date) to authenticated;

-- Existing stale rows: if no open requested document exists for this bank/app,
-- stop labeling the file as waiting for documents.
update public.application_banks ab
   set status = 'en_evaluacion'
 where ab.status = 'pendiente_docs'
   and not exists (
     select 1
       from public.documents d
      where d.application_id = ab.application_id
        and d.requested_by_bank = ab.bank_id
        and d.status = 'solicitado'
   )
   and not exists (
     select 1
       from public.financing_info_requests fir
      where fir.application_id = ab.application_id
        and fir.bank_id = ab.bank_id
        and fir.status = 'abierta'
        and fir.requested_fields && array['comprobante_ingresos','referencias','info_laboral','inicial_disponible','otro']
   );
