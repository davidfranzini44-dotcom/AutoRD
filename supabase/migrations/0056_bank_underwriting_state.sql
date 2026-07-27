-- Applied live via Supabase MCP; kept here for repo parity.
--
-- Per-BANK underwriting state lives on application_banks, not on the
-- application: one application is routed to several banks at once, so BHD's
-- officer and BHD's stage say nothing about Popular's. On financing_applications
-- they would be a single shared field pretending to be per-bank.
alter table public.application_banks
  add column if not exists assigned_officer_id uuid references public.profiles(id) on delete set null,
  add column if not exists underwriting_stage text not null default 'nuevo',
  add column if not exists stage_updated_at timestamptz;

-- Only the PRE-decision workflow. Pre-aprobado / Aprobado / Rechazado already
-- live in application_banks.status, and Expirado is derived from valid_until --
-- storing them again here would create a second answer to "what happened to this
-- application?" that can drift from the first.
alter table public.application_banks drop constraint if exists appbanks_stage_chk;
alter table public.application_banks add constraint appbanks_stage_chk check (
  underwriting_stage in ('nuevo','identidad','ingresos','esperando_info','comite')
);

-- How the application arrived IS a property of the application itself.
alter table public.financing_applications add column if not exists source text;
alter table public.financing_applications drop constraint if exists fin_app_source_chk;
alter table public.financing_applications add constraint fin_app_source_chk check (
  source is null or source in ('cliente','dealer','link','marketplace')
);

-- Internal notes: bank-private, per (application, bank). Before this they were
-- React state and vanished on refresh, so nothing a bank wrote about a client
-- survived -- despite being the thing the audit trail is supposed to hold.
create table if not exists public.financing_internal_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  bank_id uuid not null references public.banks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null,
  next_action text,
  next_action_date date,
  created_at timestamptz not null default now()
);
create index if not exists fin_notes_app_bank_idx
  on public.financing_internal_notes (application_id, bank_id, created_at desc);

alter table public.financing_internal_notes enable row level security;

-- Never readable by the buyer or the dealer, and never by another bank.
drop policy if exists fin_notes_read on public.financing_internal_notes;
create policy fin_notes_read on public.financing_internal_notes for select
  using (bank_id = auth_bank_id() or is_admin());

drop policy if exists fin_notes_insert on public.financing_internal_notes;
create policy fin_notes_insert on public.financing_internal_notes for insert
  with check (
    bank_id = auth_bank_id()
    and exists (
      select 1 from public.application_banks ab
      where ab.application_id = financing_internal_notes.application_id
        and ab.bank_id = financing_internal_notes.bank_id
    )
  );

grant select, insert on public.financing_internal_notes to authenticated;
