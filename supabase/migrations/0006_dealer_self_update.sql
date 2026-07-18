-- ============================================================
-- 0006_dealer_self_update.sql
-- Let a dealer edit their own dealer row (contact / hours / locations)
-- from the dealer console. auth_dealer_id() = the signed-in user's dealer.
-- ============================================================

do $$ begin
  create policy dealers_owner_update on dealers for update
    using (id = auth_dealer_id())
    with check (id = auth_dealer_id());
exception when duplicate_object then null; end $$;
