-- ============================================================
-- AutoRD KYC validity / re-verification
-- Stamp when a buyer's identity was verified so a valid KYC (within 12 months)
-- can be reused across financing applications instead of forcing a fresh Didit
-- flow every time. `mark_kyc_verified()` records "now" for the caller; the 12-
-- month validity + "Volver a verificar" are handled client-side.
-- (Applied live via Supabase MCP; kept here for repo parity.)
-- ============================================================

alter table public.profiles add column if not exists kyc_verified_at timestamptz;

create or replace function public.mark_kyc_verified()
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare ts timestamptz := now();
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.profiles set kyc_verified_at = ts where id = auth.uid();
  return ts;
end $$;

revoke all on function public.mark_kyc_verified() from anon;
grant execute on function public.mark_kyc_verified() to authenticated;
