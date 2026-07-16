-- ============================================================
-- AutoRD 0002 — favorites table + more seed vehicles
-- Optional: run in the SQL Editor to enrich the live marketplace.
-- ============================================================

-- Favorites (per logged-in buyer)
create table if not exists favorites (
  profile_id uuid not null references profiles(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, vehicle_id)
);
alter table favorites enable row level security;

drop policy if exists favorites_own on favorites;
create policy favorites_own on favorites for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- More vehicles
insert into vehicles
  (dealer_id, slug, make, model, year, trim, transmission, fuel, engine, mileage, color, body_type,
   price, condition, certified, location, financing, description, features, tone, monthly, apr, term_years, status, views, photos_count)
values
  ((select id from dealers where slug='auto-america'), 'toyota-corolla-2022','Toyota','Corolla',2022,'LE','Automática','Gasolina','1.8L',28000,'Plata','Sedán',
   1180000,'usado',true,'Santo Domingo',true,'Toyota Corolla LE 2022, súper económico y confiable.',
   '["Pantalla táctil","CarPlay","Cámara de retroceso","Control de crucero","Sensores","Faros LED"]'::jsonb,'#94a3b8',26300,9.5,7,'publicado',540,19),

  ((select id from dealers where slug='top-auto-rd'), 'honda-civic-2020','Honda','Civic',2020,'Sport','Automática','Gasolina','2.0L',45000,'Negro','Sedán',
   1090000,'usado',false,'Santiago',true,'Honda Civic Sport 2020, deportivo y eficiente.',
   '["Modo Sport","Pantalla táctil","Cámara de retroceso","Bluetooth","Rines de aleación","Keyless"]'::jsonb,'#1f2937',24500,9.9,7,'publicado',480,17),

  ((select id from dealers where slug='autoimport-srl'), 'hyundai-santafe-2021','Hyundai','Santa Fe',2021,'Limited','Automática','Gasolina','2.5L',33000,'Blanco','SUV',
   1890000,'usado',true,'La Romana',true,'Hyundai Santa Fe Limited 2021, 3 filas, full equipo.',
   '["3 filas","Asientos en piel","Techo panorámico","Cámara 360","Pantalla digital","Keyless"]'::jsonb,'#e2e8f0',42100,9.25,7,'publicado',610,22),

  ((select id from dealers where slug='top-auto-rd'), 'ford-ranger-2023','Ford','Ranger',2023,'XLT','Automática','Diésel','2.0L Turbo',19000,'Azul','Pickup',
   2280000,'usado',true,'Santiago',true,'Ford Ranger XLT 2023 diésel, doble cabina 4x4.',
   '["4x4","Doble cabina","Pantalla táctil","Cámara de retroceso","Control de descenso","Faros LED"]'::jsonb,'#1e3a5f',50800,9.0,7,'publicado',720,26),

  ((select id from dealers where slug='auto-america'), 'kia-picanto-2021','Kia','Picanto',2021,'LX','Manual','Gasolina','1.2L',31000,'Rojo','Hatchback',
   690000,'usado',false,'Santo Domingo',true,'Kia Picanto LX 2021, compacto y muy económico.',
   '["Pantalla táctil","Bluetooth","Cámara de retroceso","Aire acondicionado","USB","Rines"]'::jsonb,'#b91c1c',15600,10.75,6,'publicado',390,14),

  ((select id from dealers where slug='autoimport-srl'), 'toyota-hilux-2022','Toyota','Hilux',2022,'SR','Automática','Diésel','2.4L Turbo',41000,'Gris','Pickup',
   2450000,'usado',true,'Santiago',true,'Toyota Hilux SR 2022 diésel 4x4, la pickup más confiable.',
   '["4x4","Doble cabina","Cámara de retroceso","Pantalla táctil","Control de tracción","Bluetooth"]'::jsonb,'#4b5563',54600,8.95,7,'publicado',830,28)
on conflict (slug) do nothing;
