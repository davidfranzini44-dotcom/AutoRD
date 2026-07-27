-- Applied live via Supabase MCP; kept here for repo parity.
--
-- Writes go through RPCs so the audit entry lands in the SAME transaction as the
-- change. A client-side update plus a separate log call can silently drop the
-- log, which is exactly the half of the pair you need when reconstructing who
-- did what to an application.
create or replace function public.bank_set_underwriting(
  p_response_id uuid, p_stage text default null, p_officer uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_bank uuid := auth_bank_id();
  v_app uuid; v_actor text; v_officer_name text;
begin
  if v_bank is null then raise exception 'not a bank user'; end if;
  select ab.application_id into v_app from application_banks ab
   where ab.id = p_response_id and ab.bank_id = v_bank;
  if v_app is null then raise exception 'response not found for this bank'; end if;
  select coalesce(full_name, 'Banco') into v_actor from profiles where id = auth.uid();

  if p_stage is not null then
    update application_banks set underwriting_stage = p_stage, stage_updated_at = now()
     where id = p_response_id and bank_id = v_bank;
    insert into financing_events(application_id, actor, kind, detail, meta)
    values (v_app, v_actor, 'stage_changed', 'Etapa interna: ' || p_stage,
            jsonb_build_object('bank_id', v_bank, 'stage', p_stage, 'internal', true));
  end if;

  if p_officer is not null then
    -- An officer must belong to THIS bank, or a bank could assign an application
    -- to another institution's staff.
    if not exists (select 1 from profiles p where p.id = p_officer and p.bank_id = v_bank) then
      raise exception 'officer does not belong to this bank';
    end if;
    select full_name into v_officer_name from profiles where id = p_officer;
    update application_banks set assigned_officer_id = p_officer
     where id = p_response_id and bank_id = v_bank;
    insert into financing_events(application_id, actor, kind, detail, meta)
    values (v_app, v_actor, 'officer_assigned', 'Analista asignado: ' || coalesce(v_officer_name, '—'),
            jsonb_build_object('bank_id', v_bank, 'officer_id', p_officer, 'internal', true));
  end if;
end $$;

-- Separate from the above because NULL there means "leave alone", so there would
-- otherwise be no way to express "clear the assignment".
create or replace function public.bank_unassign_officer(p_response_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_bank uuid := auth_bank_id(); v_app uuid; v_actor text;
begin
  if v_bank is null then raise exception 'not a bank user'; end if;
  select ab.application_id into v_app from application_banks ab
   where ab.id = p_response_id and ab.bank_id = v_bank;
  if v_app is null then raise exception 'response not found for this bank'; end if;
  select coalesce(full_name, 'Banco') into v_actor from profiles where id = auth.uid();
  update application_banks set assigned_officer_id = null
   where id = p_response_id and bank_id = v_bank;
  insert into financing_events(application_id, actor, kind, detail, meta)
  values (v_app, v_actor, 'officer_assigned', 'Analista sin asignar',
          jsonb_build_object('bank_id', v_bank, 'internal', true));
end $$;

create or replace function public.bank_add_internal_note(
  p_application_id uuid, p_note text,
  p_next_action text default null, p_next_action_date date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_bank uuid := auth_bank_id(); v_id uuid; v_actor text;
begin
  if v_bank is null then raise exception 'not a bank user'; end if;
  if p_note is null or btrim(p_note) = '' then raise exception 'nota vacía'; end if;
  if not exists (select 1 from application_banks ab
                 where ab.application_id = p_application_id and ab.bank_id = v_bank) then
    raise exception 'application not routed to this bank';
  end if;
  select coalesce(full_name, 'Banco') into v_actor from profiles where id = auth.uid();

  insert into financing_internal_notes(application_id, bank_id, author_id, note, next_action, next_action_date)
  values (p_application_id, v_bank, auth.uid(), btrim(p_note),
          nullif(btrim(coalesce(p_next_action,'')),''), p_next_action_date)
  returning id into v_id;

  -- The timeline records THAT a note exists, never its text: financing_events is
  -- readable by the buyer, and internal notes must never leak through it.
  insert into financing_events(application_id, actor, kind, detail, meta)
  values (p_application_id, v_actor, 'internal_note', 'Nota interna agregada',
          jsonb_build_object('bank_id', v_bank, 'internal', true));
  return v_id;
end $$;

revoke all on function public.bank_set_underwriting(uuid, text, uuid) from public, anon;
revoke all on function public.bank_unassign_officer(uuid) from public, anon;
revoke all on function public.bank_add_internal_note(uuid, text, text, date) from public, anon;
grant execute on function public.bank_set_underwriting(uuid, text, uuid) to authenticated;
grant execute on function public.bank_unassign_officer(uuid) to authenticated;
grant execute on function public.bank_add_internal_note(uuid, text, text, date) to authenticated;
