-- ============================================================
-- AutoRD — pre-approval lifecycle
-- 1) Bank-set validity on each response (no default; the bank decides).
-- 2) Car-pick continuation: stamp when a pre-approved buyer links a vehicle,
--    and notify the routed banks so they can confirm a final offer.
-- 3) Client credit history, privacy-scoped:
--      - a bank sees only ITS OWN past decisions for the client;
--      - a dealer sees OUTCOMES ONLY (no income, cédula, apr) — never another
--        party's sensitive data.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

-- 1) Validity date the bank sets when it pre-approves / offers. NULL = open-ended.
alter table public.application_banks
  add column if not exists valid_until date;

-- 2) When the buyer attaches a concrete vehicle to a pre-approval.
alter table public.financing_applications
  add column if not exists vehicle_linked_at timestamptz;

-- ---- Car-pick continuation: notify the routed banks -------------------------
-- Called after a buyer links a vehicle to an existing pre-approval. Writes an
-- in-app notification to every bank that was routed on the application, so they
-- can turn the pre-approval into a concrete/final offer. Caller must own the
-- application (or be admin); SECURITY DEFINER lets it write into bank inboxes.
create or replace function public.notify_vehicle_linked(p_application_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
declare
  a_buyer uuid; a_dealer uuid; v_label text;
begin
  select fa.buyer_id, fa.dealer_id,
         coalesce(v.make || ' ' || v.model || ' ' || v.year::text, 'un vehículo')
    into a_buyer, a_dealer, v_label
  from public.financing_applications fa
  left join public.vehicles v on v.id = fa.vehicle_id
  where fa.id = p_application_id;

  if a_buyer is null then return; end if;
  if not (public.is_admin() or a_buyer = auth.uid()) then return; end if;

  -- one notification per routed bank's members
  insert into public.notifications (profile_id, kind, title, body, link)
  select p.id, 'vehicle_linked',
         'Cliente pre-aprobado eligió un vehículo',
         'El cliente seleccionó ' || v_label || '. Confirma la oferta final.',
         '/banco'
  from public.application_banks ab
  join public.profiles p on p.bank_id = ab.bank_id
  where ab.application_id = p_application_id
    and ab.status::text in ('preaprobada','oferta','condicional','en_evaluacion');
end $$;
grant execute on function public.notify_vehicle_linked(uuid) to authenticated;

-- ---- Client history for the signed-in BANK ---------------------------------
-- Every past application of this buyer WHERE THIS BANK WAS ROUTED, with this
-- bank's own decision. A bank never sees another bank's response here.
create or replace function public.get_client_history_for_bank(p_buyer_id uuid)
returns table (
  application_id uuid,
  code text,
  created_at timestamptz,
  vehicle_label text,
  is_preapproval boolean,
  requested_amount numeric,
  status text,
  apr numeric,
  term_years int,
  approved_amount numeric,
  valid_until date,
  responded_at timestamptz,
  kyc_status text,
  vehicle_linked_at timestamptz
)
language sql stable security definer set search_path=public as $$
  select fa.id, fa.code, fa.created_at,
         nullif(trim(coalesce(v.make,'') || ' ' || coalesce(v.model,'') || ' ' ||
           coalesce(v.year::text,'')), '') as vehicle_label,
         (fa.vehicle_id is null) as is_preapproval,
         fa.requested_amount,
         ab.status::text, ab.apr, ab.term_years, ab.approved_amount, ab.valid_until,
         ab.responded_at, fa.kyc_status::text, fa.vehicle_linked_at
  from public.financing_applications fa
  join public.application_banks ab
    on ab.application_id = fa.id and ab.bank_id = public.auth_bank_id()
  left join public.vehicles v on v.id = fa.vehicle_id
  where fa.buyer_id = p_buyer_id
    and public.auth_bank_id() is not null
  order by fa.created_at desc;
$$;
grant execute on function public.get_client_history_for_bank(uuid) to authenticated;

-- ---- Client history for the signed-in DEALER -------------------------------
-- Outcomes only for applications tied to THIS dealer. No income, cédula, apr or
-- any credit detail — just whether the client was pre-approved/approved/declined
-- and on which vehicle, so the dealer gets a sense of the client.
create or replace function public.get_client_history_for_dealer(p_buyer_id uuid)
returns table (
  application_id uuid,
  code text,
  created_at timestamptz,
  vehicle_label text,
  outcome text,
  kyc_status text
)
language sql stable security definer set search_path=public as $$
  select fa.id, fa.code, fa.created_at,
         nullif(trim(coalesce(v.make,'') || ' ' || coalesce(v.model,'') || ' ' ||
           coalesce(v.year::text,'')), '') as vehicle_label,
         -- best outcome across the routed banks, collapsed to a coarse label
         coalesce((
           select case
             when bool_or(ab.status::text = 'oferta') then 'aprobado'
             when bool_or(ab.status::text = 'condicional') then 'condicional'
             when bool_or(ab.status::text = 'preaprobada') then 'preaprobado'
             when bool_or(ab.status::text = 'pendiente_docs') then 'docs'
             when bool_or(ab.status::text = 'en_evaluacion') then 'evaluando'
             when bool_or(ab.status::text = 'rechazada') then 'rechazado'
             else 'sin_respuesta' end
           from public.application_banks ab where ab.application_id = fa.id
         ), 'sin_respuesta') as outcome,
         fa.kyc_status::text
  from public.financing_applications fa
  left join public.vehicles v on v.id = fa.vehicle_id
  where fa.buyer_id = p_buyer_id
    and fa.dealer_id = public.auth_dealer_id()
    and public.auth_dealer_id() is not null
  order by fa.created_at desc;
$$;
grant execute on function public.get_client_history_for_dealer(uuid) to authenticated;
