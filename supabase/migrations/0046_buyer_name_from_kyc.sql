-- ============================================================
-- AutoRD — never send a bank a nameless application
-- A buyer whose identity is already verified skips the "datos" step, so
-- buyer_name was left blank and the bank saw an unnamed file. The name is
-- already known: Didit read it off the cédula. Fill it from there whenever the
-- application itself doesn't carry one.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

-- Name as read off the verified document (handles both Didit payload shapes).
create or replace function public.kyc_name_for(p_profile uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(trim(coalesce(
    k.decision->'decision'->'id_verification'->>'full_name',
    k.decision->'decision'->'id_verifications'->0->>'full_name',
    k.decision->'id_verification'->>'full_name',
    k.decision->'id_verifications'->0->>'full_name'
  )), '')
  from public.kyc_verifications k
  where k.profile_id = p_profile and k.status = 'aprobado'
  order by k.updated_at desc nulls last
  limit 1;
$$;

-- Fill the blank at write time, so this can't regress from any code path.
create or replace function public.trg_fill_buyer_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.buyer_name is null or trim(new.buyer_name) = '' then
    new.buyer_name := coalesce(
      public.kyc_name_for(new.buyer_id),
      (select nullif(trim(p.full_name), '') from public.profiles p where p.id = new.buyer_id)
    );
  end if;
  return new;
end $$;

drop trigger if exists fill_buyer_name on public.financing_applications;
create trigger fill_buyer_name
  before insert or update of buyer_name, buyer_id on public.financing_applications
  for each row execute function public.trg_fill_buyer_name();

-- One-time backfill for applications already sitting in the banks' queues.
update public.financing_applications fa
set buyer_name = public.kyc_name_for(fa.buyer_id)
where (fa.buyer_name is null or trim(fa.buyer_name) = '')
  and public.kyc_name_for(fa.buyer_id) is not null;

-- Keep the profile in step too, so the account hub greets them by name.
update public.profiles p
set full_name = public.kyc_name_for(p.id)
where (p.full_name is null or trim(p.full_name) = '')
  and public.kyc_name_for(p.id) is not null;
