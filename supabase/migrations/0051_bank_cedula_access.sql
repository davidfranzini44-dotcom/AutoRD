-- ============================================================
-- AutoRD — the full cédula, for the banks that are entitled to it
-- A bank routed on an application has signed consent to pull credit, and cannot
-- do that against "###-•••••••-#". The full number exists (Didit read it off the
-- verified document) but sat unreachable in kyc_verifications, whose RLS is
-- owner+admin only.
--
-- Access is deliberately narrow and audited:
--   * only a bank actually routed on THAT application, or an admin;
--   * never the dealer (they never see credit data);
--   * every read is written to financing_events, so there is a trail of which
--     bank looked at a customer's document number and when.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================
create or replace function public.get_application_cedula(p_application_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_buyer uuid; v_num text; v_bank uuid; v_bank_name text;
begin
  select fa.buyer_id into v_buyer from public.financing_applications fa where fa.id = p_application_id;
  if v_buyer is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_bank := public.auth_bank_id();
  -- Must be a bank routed on this application, or an admin.
  if not (public.is_admin() or (v_bank is not null and exists (
    select 1 from public.application_banks ab
    where ab.application_id = p_application_id and ab.bank_id = v_bank
  ))) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select nullif(regexp_replace(coalesce(
    k.decision->'decision'->'id_verification'->>'document_number',
    k.decision->'decision'->'id_verification'->>'personal_number',
    k.decision->'decision'->'id_verifications'->0->>'document_number',
    k.decision->'id_verification'->>'document_number'
  ), '[^0-9]', '', 'g'), '') into v_num
  from public.kyc_verifications k
  where k.profile_id = v_buyer and k.status = 'aprobado'
  order by k.updated_at desc nulls last limit 1;

  if v_num is null then return jsonb_build_object('ok', false, 'reason', 'no_cedula'); end if;

  -- Audit the disclosure.
  select name into v_bank_name from public.banks where id = v_bank;
  insert into public.financing_events (application_id, actor, kind, detail, meta)
  values (p_application_id, 'banco', 'cedula_viewed',
          coalesce(v_bank_name, 'Admin'), jsonb_build_object('bankId', v_bank));

  -- DR cédulas are 11 digits: 000-0000000-0
  return jsonb_build_object('ok', true, 'cedula',
    case when length(v_num) = 11
      then substr(v_num,1,3) || '-' || substr(v_num,4,7) || '-' || substr(v_num,11,1)
      else v_num end);
end $$;
grant execute on function public.get_application_cedula(uuid) to authenticated;
