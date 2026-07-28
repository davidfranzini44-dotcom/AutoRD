-- AutoRD 0063 -- sync the cédula KYC name into the buyer profile
--
-- WhatsApp login accounts use synthetic emails like wa18294201557@autord.local.
-- If profiles.full_name stays blank after KYC, the account hub greets the buyer
-- as "wa18294201557". The verified document name is already in Didit's decision,
-- so make that name the canonical buyer display name.

create schema if not exists private;

create or replace function private.extract_kyc_full_name(d jsonb)
returns text language sql immutable as $$
  with root as (
    select coalesce(d->'decision', d) as r
  ), idv as (
    select r, coalesce(
      case when jsonb_typeof(r->'id_verifications') = 'array'
           then r->'id_verifications'->0 else r->'id_verifications' end,
      r->'id_verification', r->'document', '{}'::jsonb) as v
    from root
  ), raw as (
    select coalesce(
      v->>'full_name',
      v->>'fullName',
      v->>'name',
      v->>'full_name_latin',
      v->>'latin_name',
      nullif(trim(concat_ws(' ', v->>'first_name', v->>'middle_name', v->>'last_name')), ''),
      r->>'full_name',
      r->>'fullName',
      r->>'name',
      nullif(trim(concat_ws(' ', r->>'first_name', r->>'middle_name', r->>'last_name')), '')
    ) as s
    from idv
  )
  select nullif(trim(regexp_replace(coalesce(s, ''), '\s+', ' ', 'g')), '')
  from raw;
$$;

create or replace function public.kyc_name_for(p_profile uuid)
returns text language sql stable security definer set search_path = public as $$
  select private.extract_kyc_full_name(k.decision)
  from public.kyc_verifications k
  where k.profile_id = p_profile
    and k.status = 'aprobado'
    and private.extract_kyc_full_name(k.decision) is not null
  order by k.updated_at desc nulls last, k.created_at desc
  limit 1;
$$;

-- Backfill all verified profiles with the name on the cédula. This intentionally
-- makes KYC the canonical legal display name for financing.
update public.profiles p
set full_name = public.kyc_name_for(p.id)
where public.kyc_name_for(p.id) is not null;

-- Keep buyer_name aligned too, so dealer/bank/customer views agree.
update public.financing_applications fa
set buyer_name = public.kyc_name_for(fa.buyer_id)
where public.kyc_name_for(fa.buyer_id) is not null;
