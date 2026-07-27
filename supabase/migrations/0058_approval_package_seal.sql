-- Applied live via Supabase MCP; kept here for repo parity.
--
-- Approval package = provenance + a seal over terms that ALREADY exist on
-- application_banks (approved_amount, apr, term_years, monthly, down_required,
-- valid_until, notes) and are already rendered by /contrato/:token under
-- "Condiciones ofrecidas por {banco}". No financing_packages table: copying
-- those figures would give two answers the first time a bank edits an offer
-- after generating -- the same drift argument as underwriting_stage/Expirado.
alter table public.application_banks
  add column if not exists package_generated_at timestamptz,
  add column if not exists package_generated_by uuid references public.profiles(id) on delete set null,
  add column if not exists package_hash text;

-- One definition of "the terms", so generation and drift-checking cannot
-- disagree. Mirrors seal_financing_contract: sha256 over a pipe-joined
-- canonical string, built-in, no pgcrypto schema qualification needed.
create or replace function private.package_terms_hash(p_response_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(
      coalesce(ab.status::text,'')            || '|' ||
      coalesce(ab.approved_amount::text,'')   || '|' ||
      coalesce(ab.apr::text,'')               || '|' ||
      coalesce(ab.term_years::text,'')        || '|' ||
      coalesce(ab.monthly::text,'')           || '|' ||
      coalesce(ab.down_required::text,'')     || '|' ||
      coalesce(ab.valid_until::text,'')       || '|' ||
      coalesce(ab.notes,'')                   || '|' ||
      ab.id::text, 'UTF8')), 'hex')
  from public.application_banks ab where ab.id = p_response_id;
$$;

-- Generating is a real event: the moment a bank says "these are the terms".
create or replace function public.bank_generate_package(p_response_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bank uuid := auth_bank_id();
  v_app uuid; v_actor text; v_hash text; v_status text;
begin
  if v_bank is null then raise exception 'not a bank user'; end if;
  select ab.application_id, ab.status::text into v_app, v_status
  from application_banks ab where ab.id = p_response_id and ab.bank_id = v_bank;
  if v_app is null then raise exception 'response not found for this bank'; end if;

  -- A package states decided terms. Generating one for a file with no decision
  -- would produce a document asserting an offer that does not exist.
  if v_status not in ('preaprobada','oferta','condicional') then
    raise exception 'no hay una decisión con condiciones para empaquetar';
  end if;

  v_hash := private.package_terms_hash(p_response_id);
  select coalesce(full_name,'Banco') into v_actor from profiles where id = auth.uid();

  update application_banks
     set package_generated_at = now(), package_generated_by = auth.uid(), package_hash = v_hash
   where id = p_response_id and bank_id = v_bank;

  insert into financing_events(application_id, actor, kind, detail, meta)
  values (v_app, v_actor, 'package_generated', 'Paquete de condiciones generado',
          jsonb_build_object('bank_id', v_bank, 'hash', v_hash));

  return jsonb_build_object('hash', v_hash, 'generatedAt', now(), 'generatedBy', v_actor);
end $$;

-- Staleness is "stored seal <> seal of the terms as they stand now". An RPC
-- rather than a generated column or a client-side hash, so package_terms_hash
-- stays the single definition of what "the terms" are.
create or replace function public.bank_package_state(p_response_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_bank uuid := auth_bank_id(); v_row record; v_by text;
begin
  if v_bank is null then raise exception 'not a bank user'; end if;
  select ab.package_generated_at, ab.package_generated_by, ab.package_hash, ab.status::text
    into v_row
  from application_banks ab where ab.id = p_response_id and ab.bank_id = v_bank;
  if not found then return null; end if;
  select coalesce(full_name, 'Banco') into v_by from profiles where id = v_row.package_generated_by;
  return jsonb_build_object(
    'generatedAt', v_row.package_generated_at,
    'generatedBy', v_by,
    'hasPackage', v_row.package_hash is not null,
    'stale', v_row.package_hash is not null
             and v_row.package_hash <> private.package_terms_hash(p_response_id),
    'canGenerate', v_row.status in ('preaprobada','oferta','condicional')
  );
end $$;

revoke all on function public.bank_generate_package(uuid) from public, anon;
revoke all on function public.bank_package_state(uuid) from public, anon;
grant execute on function public.bank_generate_package(uuid) to authenticated;
grant execute on function public.bank_package_state(uuid) to authenticated;
