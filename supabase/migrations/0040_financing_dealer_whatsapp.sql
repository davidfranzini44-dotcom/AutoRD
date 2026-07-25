-- ============================================================
-- AutoRD — client financing portal polish: dealer WhatsApp on the token payload
-- so the portal's "Preguntar por WhatsApp" button reaches the actual dealer with
-- prefilled context, instead of an empty share sheet.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================
create or replace function public.get_financing_by_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.financing_public_tokens; fa public.financing_applications; result jsonb;
begin
  select * into t from public.financing_public_tokens where token = p_token;
  if t.token is null then return jsonb_build_object('authorized', false, 'reason', 'not_found'); end if;
  if t.revoked or t.expires_at < now() then return jsonb_build_object('authorized', false, 'reason', 'expired'); end if;
  if t.cedula_verified_at is null or t.otp_verified_at is null then
    return jsonb_build_object('authorized', false, 'reason', 'unverified');
  end if;
  select * into fa from public.financing_applications where id = t.application_id;
  select jsonb_build_object(
    'authorized', true, 'applicationId', fa.id, 'code', fa.code, 'createdAt', fa.created_at,
    'isPreapproval', (fa.vehicle_id is null), 'kycStatus', fa.kyc_status::text, 'consentSigned', fa.consent_signed,
    'vehicleLinkedAt', fa.vehicle_linked_at, 'requestedAmount', fa.requested_amount, 'down', fa.down_payment,
    'term', fa.term_years, 'customerName', fa.buyer_name,
    'clientAcceptedAt', fa.client_accepted_at, 'reservedUntil', fa.reserved_until,
    'selectedBankSlug', (select b.slug from public.banks b where b.id = fa.selected_bank_id),
    'dealerName', d.name, 'dealerWhatsapp', d.whatsapp,
    'vehicle', case when v.id is not null then jsonb_build_object('id', v.id, 'slug', v.slug, 'make', v.make,
        'model', v.model, 'year', v.year, 'price', v.price, 'dealer', d.name) else null end,
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bankName', bb.name, 'bankSlug', bb.slug, 'bankColor', bb.color, 'bankInitials', bb.initials,
        'status', ab.status::text, 'apr', ab.apr, 'term', ab.term_years, 'monthly', ab.monthly,
        'down', ab.down_required, 'approvedAmount', ab.approved_amount, 'validUntil', ab.valid_until,
        'notes', ab.notes, 'respondedAt', ab.responded_at, 'selected', ab.selected) order by ab.responded_at desc nulls last)
      from public.application_banks ab join public.banks bb on bb.id = ab.bank_id where ab.application_id = fa.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('actor', e.actor, 'kind', e.kind, 'detail', e.detail, 'at', e.created_at)
        order by e.created_at desc)
      from public.financing_events e where e.application_id = fa.id
    ), '[]'::jsonb)
  ) into result
  from public.financing_applications x
  left join public.vehicles v on v.id = fa.vehicle_id
  left join public.dealers d on d.id = fa.dealer_id
  where x.id = fa.id;
  return result;
end $$;
grant execute on function public.get_financing_by_token(uuid) to anon, authenticated;
