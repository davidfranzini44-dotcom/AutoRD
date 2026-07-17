-- ============================================================
-- 0004_preapproval.sql
-- Car-agnostic pre-aprobación support.
--
-- A pre-approval is simply a financing_applications row with
-- vehicle_id = null (both vehicle_id and dealer_id are already
-- nullable since 0001). The only structural gap is a place for a
-- bank to return the maximum amount it will finance — "pre-aprobado
-- hasta RD$X" — before the customer has chosen a specific car.
-- ============================================================

alter table application_banks
  add column if not exists approved_amount numeric;

comment on column application_banks.approved_amount is
  'Max amount the bank pre-approves for financing (RD$). Set on a pre-aprobada/oferta response, especially for car-agnostic pre-approvals (application.vehicle_id is null).';
