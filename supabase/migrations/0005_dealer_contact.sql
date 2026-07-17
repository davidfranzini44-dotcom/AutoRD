-- ============================================================
-- 0005_dealer_contact.sql
-- Dealer contact + presence for the public dealer profile:
--   whatsapp   – number for the WhatsApp contact button
--   hours      – free-text operating hours
--   locations  – array of branches [{ name, address, city, lat, lng }]
-- ============================================================

alter table dealers add column if not exists whatsapp text;
alter table dealers add column if not exists hours text;
alter table dealers add column if not exists locations jsonb not null default '[]'::jsonb;
