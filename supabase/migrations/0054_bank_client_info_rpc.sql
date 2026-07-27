-- Applied live via Supabase MCP; kept here for repo parity.
--
-- One call returns both halves of the Cliente panel:
--   declared -> what the client themselves entered (canonical, live from profiles)
--   bank     -> what THIS bank recorded privately (never visible to other banks)
-- A dedicated RPC rather than a profiles policy: a bank has no business reading
-- a buyer's whole profile row (cedula_last4_hash, kyc timestamps, role...), only
-- the handful of fields the client declared for financing.
create or replace function public.bank_client_info(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank uuid := auth_bank_id();
  v_admin boolean := is_admin();
  v_app record;
  v_prof record;
  v_bcd record;
  v_has_bcd boolean := false;
begin
  if v_bank is null and not v_admin then
    raise exception 'not a bank user';
  end if;

  select a.buyer_id, a.buyer_email, a.buyer_name, a.buyer_phone
    into v_app
  from financing_applications a
  where a.id = p_application_id;
  if not found then
    return null;
  end if;

  -- Consent boundary: the bank must actually be routed on this application.
  if not v_admin and not exists (
    select 1 from application_banks ab
    where ab.application_id = p_application_id and ab.bank_id = v_bank
  ) then
    raise exception 'application not routed to this bank';
  end if;

  select p.full_name, p.email, p.phone, p.occupation, p.provincia, p.address_line
    into v_prof
  from profiles p where p.id = v_app.buyer_id;

  select b.email, b.occupation, b.provincia, b.address_line, b.updated_at
    into v_bcd
  from bank_client_details b
  where b.application_id = p_application_id and b.bank_id = v_bank;
  v_has_bcd := found;

  return jsonb_build_object(
    'declared', jsonb_build_object(
      'fullName',    coalesce(v_prof.full_name, v_app.buyer_name),
      'email',       coalesce(v_prof.email, v_app.buyer_email),
      'phone',       coalesce(v_prof.phone, v_app.buyer_phone),
      'occupation',  v_prof.occupation,
      'provincia',   v_prof.provincia,
      'addressLine', v_prof.address_line
    ),
    'bank', case when v_has_bcd then jsonb_build_object(
      'email',       v_bcd.email,
      'occupation',  v_bcd.occupation,
      'provincia',   v_bcd.provincia,
      'addressLine', v_bcd.address_line,
      'updatedAt',   v_bcd.updated_at
    ) else null end
  );
end $$;

revoke all on function public.bank_client_info(uuid) from public, anon;
grant execute on function public.bank_client_info(uuid) to authenticated;
