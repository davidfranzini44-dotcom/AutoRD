-- ============================================================
-- AutoRD — initial schema, security (RLS) and helpers
-- Marketplace + financing orchestration.
-- AutoRD stores KYC *status* and consent, never biometric data.
-- Banks perform credit checks externally and respond in-app.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------------- Enums ----------------
do $$ begin
  create type user_role as enum ('buyer','dealer','bank','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type vehicle_condition as enum ('nuevo','usado','certificado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type vehicle_status as enum ('borrador','publicado','reservado','vendido');
exception when duplicate_object then null; end $$;
do $$ begin
  create type application_status as enum ('borrador','enviada','en_evaluacion','con_ofertas','cerrada');
exception when duplicate_object then null; end $$;
do $$ begin
  create type kyc_status as enum ('pendiente','cedula_validada','vida_validada','aprobado','rechazado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type bank_response_status as enum ('pendiente','en_evaluacion','pendiente_docs','preaprobada','oferta','condicional','rechazada');
exception when duplicate_object then null; end $$;
do $$ begin
  create type notify_target as enum ('cliente','dealer','ambos');
exception when duplicate_object then null; end $$;

-- ---------------- Core reference tables ----------------
create table if not exists dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  verified boolean not null default false,
  city text,
  phone text,
  initials text,
  created_at timestamptz not null default now()
);

create table if not exists banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  color text,
  initials text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------- Profiles (1:1 with auth.users) ----------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'buyer',
  full_name text,
  phone text,
  email text,
  dealer_id uuid references dealers(id) on delete set null,
  bank_id uuid references banks(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------- Vehicles ----------------
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references dealers(id) on delete cascade,
  slug text unique not null,
  make text not null,
  model text not null,
  year int not null,
  trim text,
  transmission text,
  fuel text,
  engine text,
  mileage int not null default 0,
  color text,
  body_type text,
  price numeric not null,
  condition vehicle_condition not null default 'usado',
  certified boolean not null default false,
  location text,
  financing boolean not null default true,
  description text,
  features jsonb not null default '[]'::jsonb,
  tone text default '#4b5563',
  monthly numeric,
  apr numeric,
  term_years int default 7,
  status vehicle_status not null default 'publicado',
  views int not null default 0,
  photos_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_vehicles_status on vehicles(status);
create index if not exists idx_vehicles_dealer on vehicles(dealer_id);

create table if not exists vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  url text not null,
  position int not null default 0
);

-- ---------------- Financing applications ----------------
create sequence if not exists app_code_seq start 2042;

create table if not exists financing_applications (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('AP-' || nextval('app_code_seq')),
  buyer_id uuid not null references profiles(id) on delete cascade,
  -- denormalized buyer contact so dealers/banks don't need to read profiles
  buyer_name text,
  buyer_phone text,
  buyer_email text,
  vehicle_id uuid references vehicles(id) on delete set null,
  dealer_id uuid references dealers(id) on delete set null,
  requested_amount numeric,
  down_payment numeric,
  term_years int,
  notify notify_target not null default 'ambos',
  status application_status not null default 'borrador',
  kyc_status kyc_status not null default 'pendiente',
  consent_signed boolean not null default false,
  consent_text text,
  consent_signed_at timestamptz,
  salesperson text,
  created_at timestamptz not null default now()
);
create index if not exists idx_apps_buyer on financing_applications(buyer_id);
create index if not exists idx_apps_dealer on financing_applications(dealer_id);

-- Sensitive financials: visible to buyer + routed banks + admin, NOT dealers
create table if not exists application_financials (
  application_id uuid primary key references financing_applications(id) on delete cascade,
  income numeric,
  employment_type text,
  cedula_masked text
);

-- Bank routing + each bank's manual response
create table if not exists application_banks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references financing_applications(id) on delete cascade,
  bank_id uuid not null references banks(id) on delete cascade,
  status bank_response_status not null default 'pendiente',
  apr numeric,
  term_years int,
  monthly numeric,
  down_required numeric,
  notes text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (application_id, bank_id)
);
create index if not exists idx_appbanks_bank on application_banks(bank_id);
create index if not exists idx_appbanks_app on application_banks(application_id);

-- KYC verification: booleans + status only. No biometrics ever stored here.
create table if not exists kyc_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  application_id uuid references financing_applications(id) on delete cascade,
  cedula_masked text,
  cedula_validated boolean not null default false,
  liveness_validated boolean not null default false,
  status kyc_status not null default 'pendiente',
  provider text default 'didit',
  created_at timestamptz not null default now()
);

-- Documents (proof of income, etc.) requested by banks / uploaded by buyer
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references financing_applications(id) on delete cascade,
  requested_by_bank uuid references banks(id) on delete set null,
  doc_type text,
  storage_path text,
  status text not null default 'solicitado',
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================
create or replace function public.auth_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.auth_dealer_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select dealer_id from profiles where id = auth.uid();
$$;

create or replace function public.auth_bank_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select bank_id from profiles where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

-- Cross-table access checks. SECURITY DEFINER so they bypass RLS on the
-- referenced table and DON'T create mutually-recursive policies between
-- financing_applications and application_banks.
create or replace function public.is_app_owner(app uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from financing_applications a where a.id = app and a.buyer_id = auth.uid());
$$;

create or replace function public.is_app_dealer(app uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from financing_applications a where a.id = app and a.dealer_id = auth_dealer_id());
$$;

create or replace function public.bank_on_app(app uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from application_banks ab where ab.application_id = app and ab.bank_id = auth_bank_id());
$$;

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'buyer')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table dealers                enable row level security;
alter table banks                  enable row level security;
alter table profiles               enable row level security;
alter table vehicles               enable row level security;
alter table vehicle_photos         enable row level security;
alter table financing_applications enable row level security;
alter table application_financials enable row level security;
alter table application_banks      enable row level security;
alter table kyc_verifications      enable row level security;
alter table documents              enable row level security;

-- dealers / banks : public read, admin write
create policy dealers_read on dealers for select using (true);
create policy dealers_write on dealers for all using (is_admin()) with check (is_admin());
create policy banks_read on banks for select using (true);
create policy banks_write on banks for all using (is_admin()) with check (is_admin());

-- profiles : self + admin
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_upd  on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- vehicles : anyone can read published; dealer manages own; admin all
create policy vehicles_read on vehicles for select
  using (status = 'publicado' or dealer_id = auth_dealer_id() or is_admin());
create policy vehicles_ins on vehicles for insert
  with check (dealer_id = auth_dealer_id() or is_admin());
create policy vehicles_upd on vehicles for update
  using (dealer_id = auth_dealer_id() or is_admin())
  with check (dealer_id = auth_dealer_id() or is_admin());
create policy vehicles_del on vehicles for delete
  using (dealer_id = auth_dealer_id() or is_admin());

-- vehicle_photos : public read, dealer-owner write
create policy vphotos_read on vehicle_photos for select using (true);
create policy vphotos_write on vehicle_photos for all
  using (exists (select 1 from vehicles v where v.id = vehicle_id and (v.dealer_id = auth_dealer_id() or is_admin())))
  with check (exists (select 1 from vehicles v where v.id = vehicle_id and (v.dealer_id = auth_dealer_id() or is_admin())));

-- financing_applications : buyer owns; dealer of the app; routed bank; admin
create policy apps_read on financing_applications for select using (
  buyer_id = auth.uid()
  or dealer_id = auth_dealer_id()
  or bank_on_app(id)
  or is_admin()
);
create policy apps_insert on financing_applications for insert
  with check (buyer_id = auth.uid());
create policy apps_update on financing_applications for update using (
  buyer_id = auth.uid() or dealer_id = auth_dealer_id() or is_admin()
) with check (
  buyer_id = auth.uid() or dealer_id = auth_dealer_id() or is_admin()
);

-- application_financials : buyer + routed bank + admin (NOT dealer)
create policy fin_read on application_financials for select using (
  is_app_owner(application_id) or bank_on_app(application_id) or is_admin()
);
create policy fin_write on application_financials for all using (
  is_app_owner(application_id) or is_admin()
) with check (
  is_app_owner(application_id) or is_admin()
);

-- application_banks : buyer of app / dealer of app / the bank itself / admin can read;
-- only the bank (or admin) can update its own response row.
create policy appbanks_read on application_banks for select using (
  bank_id = auth_bank_id()
  or is_app_owner(application_id)
  or is_app_dealer(application_id)
  or is_admin()
);
create policy appbanks_insert on application_banks for insert with check (
  is_app_owner(application_id) or is_admin()
);
create policy appbanks_update on application_banks for update
  using (bank_id = auth_bank_id() or is_admin())
  with check (bank_id = auth_bank_id() or is_admin());

-- kyc_verifications : owner + admin only (dealers/banks never read biometrics table)
create policy kyc_owner_read on kyc_verifications for select using (profile_id = auth.uid() or is_admin());
create policy kyc_owner_write on kyc_verifications for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- documents : buyer of app / routed bank / admin
create policy docs_read on documents for select using (
  is_app_owner(application_id) or requested_by_bank = auth_bank_id() or is_admin()
);
create policy docs_write on documents for all using (
  is_app_owner(application_id) or requested_by_bank = auth_bank_id() or is_admin()
) with check (
  is_app_owner(application_id) or requested_by_bank = auth_bank_id() or is_admin()
);
