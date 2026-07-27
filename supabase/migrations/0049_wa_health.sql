-- ============================================================
-- AutoRD — WhatsApp delivery health
-- OTP login, the /f/:token portal gate and every bank notification depend on
-- WhatsApp. Until now the only signal was a 30-second worker heartbeat in the
-- admin panel, and that check was DISABLED whenever the shared Reparando
-- gateway was in use (`!gateway && …`) — precisely the mode production runs in.
-- A dead gateway produced no warning anywhere.
--
-- Two problems fixed here:
--   1. No cross-mode health signal. wa_health() works in BOTH modes because it
--      reads what AutoRD itself records: OTPs issued vs consumed, the delivery
--      log, and (own-worker mode) the outbox.
--   2. Messages could be lost silently. wa_claim_outbox() flips rows to
--      'sending' and NOTHING ever times them out, so a worker that dies
--      mid-claim strands them forever. wa_requeue_stuck() puts them back.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

create or replace function public.wa_health()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_queued int; v_sending_stuck int; v_oldest_queued_s numeric;
  v_sent_1h int; v_failed_1h int; v_last_sent timestamptz;
  v_otp_15m int; v_otp_15m_used int; v_last_otp timestamptz;
  v_conn public.wa_connection; v_verdict text; v_reason text;
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select count(*) filter (where status = 'queued'),
         count(*) filter (where status = 'sending' and created_at < now() - interval '5 minutes'),
         extract(epoch from (now() - min(created_at) filter (where status = 'queued')))
    into v_queued, v_sending_stuck, v_oldest_queued_s
  from public.wa_outbox;

  select count(*) filter (where status = 'sent'),
         count(*) filter (where status = 'failed'),
         max(created_at) filter (where status = 'sent')
    into v_sent_1h, v_failed_1h, v_last_sent
  from public.wa_notifications
  where created_at > now() - interval '1 hour';

  -- Delivery proof that works in EITHER mode: a code the customer could only
  -- have typed back if WhatsApp actually reached them.
  select count(*), count(consumed_at), max(created_at)
    into v_otp_15m, v_otp_15m_used, v_last_otp
  from public.phone_otps
  where created_at > now() - interval '15 minutes';

  select * into v_conn from public.wa_connection where id = 'platform';

  -- Verdict. "Nothing to send" is healthy; the alarm is for work that is stuck
  -- or codes that are going out and never coming back.
  v_verdict := 'ok'; v_reason := 'Sin problemas detectados';
  if v_sending_stuck > 0 then
    v_verdict := 'down';
    v_reason := v_sending_stuck || ' mensaje(s) atascado(s) en envío — el worker murió a mitad';
  elsif v_queued > 0 and v_oldest_queued_s > 300 then
    v_verdict := 'down';
    v_reason := 'Cola detenida: ' || v_queued || ' mensaje(s) esperando hace más de 5 minutos';
  elsif v_otp_15m >= 3 and v_otp_15m_used = 0 then
    v_verdict := 'warn';
    v_reason := v_otp_15m || ' códigos enviados y ninguno usado — puede que no estén llegando';
  elsif v_failed_1h > 0 and v_sent_1h = 0 then
    v_verdict := 'warn';
    v_reason := v_failed_1h || ' envío(s) fallido(s) en la última hora, ninguno exitoso';
  elsif v_queued > 0 then
    v_verdict := 'warn';
    v_reason := v_queued || ' mensaje(s) en cola';
  end if;

  return jsonb_build_object(
    'ok', true,
    'verdict', v_verdict,
    'reason', v_reason,
    'queued', coalesce(v_queued, 0),
    'stuckSending', coalesce(v_sending_stuck, 0),
    'oldestQueuedSeconds', coalesce(round(v_oldest_queued_s), 0),
    'sent1h', coalesce(v_sent_1h, 0),
    'failed1h', coalesce(v_failed_1h, 0),
    'lastSentAt', v_last_sent,
    'otps15m', coalesce(v_otp_15m, 0),
    'otpsUsed15m', coalesce(v_otp_15m_used, 0),
    'lastOtpAt', v_last_otp,
    'workerEnabled', coalesce(v_conn.enabled, false),
    'workerStatus', v_conn.status,
    'workerLastSeen', v_conn.last_seen_at,
    'workerError', v_conn.worker_error
  );
end $$;
revoke all on function public.wa_health() from public, anon;
grant execute on function public.wa_health() to authenticated, service_role;

-- Recover messages a dead worker stranded in 'sending'. Without this they are
-- never retried and the customer simply never receives their code.
create or replace function public.wa_requeue_stuck(p_minutes int default 5)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  update public.wa_outbox
     set status = 'queued', error = coalesce(error, '') || ' [requeued]'
   where status = 'sending'
     and created_at < now() - make_interval(mins => greatest(1, p_minutes));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.wa_requeue_stuck(int) from public, anon;
grant execute on function public.wa_requeue_stuck(int) to authenticated, service_role;
