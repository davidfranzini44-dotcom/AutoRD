-- Dealer employee accounts with granular permissions.
alter table profiles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists dealer_role text;   -- 'owner' | 'employee'
alter table profiles add column if not exists active boolean not null default true;

-- Existing dealer accounts are owners with full access.
update profiles set dealer_role = 'owner' where dealer_id is not null and dealer_role is null;

-- Members of the same dealer can read each other's profiles (team list).
drop policy if exists profiles_team_read on profiles;
create policy profiles_team_read on profiles
  for select using (dealer_id is not null and dealer_id = auth_dealer_id());
