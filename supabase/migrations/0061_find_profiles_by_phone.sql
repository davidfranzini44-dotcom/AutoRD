-- Applied live via Supabase MCP; kept here for repo parity.
--
-- Resolve a phone to the accounts that already own it, so phone+OTP login LINKS
-- to an existing buyer instead of minting a parallel wa<phone>@autord.local
-- account. Without this a buyer who registered with a real email and then logged
-- in by phone ended up with two accounts and a split financing history -- there
-- is already one such account in production.
--
-- Matches on the last 10 digits: DR numbers are stored variously as 8091234567,
-- 18091234567 and +1 809 123 4567, and a login must not fail on formatting.
create or replace function public.find_profiles_by_phone(p_digits text)
returns table (id uuid, role text, dealer_id uuid, bank_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.role::text, p.dealer_id, p.bank_id, u.email
  from profiles p
  join auth.users u on u.id = p.id
  where coalesce(p.phone, '') <> ''
    and length(regexp_replace(p.phone, '[^0-9]', '', 'g')) >= 10
    and right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_digits,''), '[^0-9]', '', 'g'), 10);
$$;

-- Deliberately NOT granted to anon or authenticated. It maps a phone number to
-- an account email, so exposing it would let anyone enumerate whether a given
-- number has an AutoRD account and what address it uses. Only the service role
-- (the wa-login-verify edge function) may call it.
revoke all on function public.find_profiles_by_phone(text) from public, anon, authenticated;
