-- Applied live via Supabase MCP; kept here for repo parity. (Applied as two
-- steps -- the first extractor missed the JSON nesting described below -- and
-- consolidated here into the corrected final state.)
--
-- The bank panel wants to show "the last 4 of the cedula", but nothing stored
-- could produce them:
--   * cedula_last4_hash is a peppered HMAC -- one way, by design.
--   * cedula_masked has the shape ###-•••••••-# : it keeps the FIRST three
--     digits and the check digit and bullets out the middle seven. Deriving a
--     "last 4" from it returned the municipality prefix plus the check digit,
--     rendered under a last-4 label -- a wrong number that looked right. It is
--     also only ever written by the demo seed; real applications have no mask.
-- So store the four digits we actually want to display, beside the hash that
-- stays for verification.
--
-- On exposure: the last 4 are the first factor of the /f/:token client gate, but
-- the WhatsApp OTP is what actually authenticates, and a bank can already reveal
-- the FULL cedula through the audited reveal RPC. Four digits visible to that
-- same audience is strictly less exposure than what they can already obtain.
alter table public.profiles
  add column if not exists cedula_last4 text
  constraint profiles_cedula_last4_fmt check (cedula_last4 is null or cedula_last4 ~ '^[0-9]{4}$');

alter table public.application_financials
  add column if not exists cedula_last4 text
  constraint appfin_cedula_last4_fmt check (cedula_last4 is null or cedula_last4 ~ '^[0-9]{4}$');

-- Same field precedence as extractCedulaLast4() in didit-webhook/kyc-grace.ts,
-- so a backfill and a live verification agree.
--
-- The webhook hands that helper the decision object it fetched from Didit
-- (id_verification at the top level), but it PERSISTS the whole webhook event
-- (index.ts stores `decision: evt`), so in the stored JSON the real decision sits
-- one level down under 'decision'. Both levels are checked.
create or replace function private.extract_cedula_last4(d jsonb)
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
    select coalesce(v->>'personal_number', v->>'document_number', v->>'national_number',
                    v->>'id_number', v->>'number', r->>'personal_number') as s
    from idv
  )
  select case
           when s is not null and length(regexp_replace(s, '[^0-9]', '', 'g')) >= 4
           then right(regexp_replace(s, '[^0-9]', '', 'g'), 4)
         end
  from raw;
$$;

-- Write the display digits alongside the hash from now on.
create or replace function public.set_application_cedula(p_buyer_id uuid, p_last4 text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_buyer_id is null or p_last4 is null or p_last4 !~ '^[0-9]{4}$' then return; end if;
  update public.profiles
     set cedula_last4_hash = private.hash_last4(p_last4),
         cedula_last4      = p_last4
   where id = p_buyer_id;
  update public.application_financials af
     set cedula_last4_hash = private.hash_last4(p_last4),
         cedula_last4      = p_last4
    from public.financing_applications fa
   where af.application_id = fa.id and fa.buyer_id = p_buyer_id;
end $$;

-- Backfill everyone already verified, from the Didit decision we stored.
with latest as (
  select distinct on (kv.profile_id)
         kv.profile_id, private.extract_cedula_last4(kv.decision) as last4
  from public.kyc_verifications kv
  where kv.decision is not null and kv.profile_id is not null
  order by kv.profile_id, kv.updated_at desc nulls last, kv.created_at desc
)
update public.profiles p
   set cedula_last4 = l.last4
  from latest l
 where l.profile_id = p.id and l.last4 is not null and p.cedula_last4 is null;

with latest as (
  select distinct on (kv.profile_id)
         kv.profile_id, private.extract_cedula_last4(kv.decision) as last4
  from public.kyc_verifications kv
  where kv.decision is not null and kv.profile_id is not null
  order by kv.profile_id, kv.updated_at desc nulls last, kv.created_at desc
)
update public.application_financials af
   set cedula_last4 = l.last4
  from public.financing_applications fa, latest l
 where af.application_id = fa.id and fa.buyer_id = l.profile_id
   and l.last4 is not null and af.cedula_last4 is null;
