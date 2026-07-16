-- ============================================================
-- AutoRD 0003 — track Didit verification session on kyc_verifications
-- ============================================================
alter table kyc_verifications add column if not exists didit_session_id text;
alter table kyc_verifications add column if not exists didit_status text;
alter table kyc_verifications add column if not exists decision jsonb;
alter table kyc_verifications add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_kyc_didit_session on kyc_verifications(didit_session_id);
