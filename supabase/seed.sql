-- ============================================================
-- AutoRD — seed data (dealers, banks, vehicles)
-- Safe to re-run: uses slug conflict guards.
-- Test users (buyer/dealer/bank) are created via the app's
-- register flow or a service-role script, not here.
-- ============================================================

insert into dealers (name, slug, verified, city, phone, initials) values
  ('Auto América',   'auto-america',  true,  'Santo Domingo', '809-555-0101', 'AA'),
  ('Top Auto RD',    'top-auto-rd',   true,  'Santiago',      '809-555-0102', 'TA'),
  ('Autoimport SRL', 'autoimport-srl',true,  'Santo Domingo', '809-555-0103', 'AS')
on conflict (slug) do nothing;

insert into banks (name, slug, color, initials, active) values
  ('Banco Popular', 'popular',     '#1a3a6b', 'BP',  true),
  ('Banreservas',   'banreservas', '#0f766e', 'BR',  true),
  ('BHD',           'bhd',         '#12805c', 'BHD', true),
  ('Scotiabank',    'scotiabank',  '#c8352b', 'SC',  true)
on conflict (slug) do nothing;

insert into vehicles
  (dealer_id, slug, make, model, year, trim, transmission, fuel, engine, mileage, color, body_type,
   price, condition, certified, location, financing, description, features, tone, monthly, apr, term_years, status, views, photos_count)
values
  ((select id from dealers where slug='auto-america'), 'honda-crv-2021', 'Honda','CR-V',2021,'EX-L','Automática','Gasolina','1.5L Turbo',42000,'Gris','SUV',
   1250000,'usado',true,'Santo Domingo',true,
   'Honda CR-V EX-L 2021 en excelentes condiciones. Mantenimientos al día. Versión full con asientos en cuero, sunroof, cámara de retroceso y más.',
   '["Asientos en cuero","Sunroof","Cámara de retroceso","CarPlay / Android Auto","Sensores de parqueo","Llave inteligente"]'::jsonb,
   '#4b5563',28400,9.5,7,'publicado',1240,24),

  ((select id from dealers where slug='top-auto-rd'), 'toyota-rav4-2020', 'Toyota','RAV4',2020,'XLE','Automática','Gasolina','2.5L',36500,'Blanco','SUV',
   1650000,'usado',true,'Santiago',true,
   'Toyota RAV4 XLE 2020, un solo dueño, importada. Ideal para familia. Muy económica y confiable, lista para financiamiento.',
   '["Pantalla táctil","Cámara de retroceso","Control de crucero","Bluetooth","Rines de aleación","Faros LED"]'::jsonb,
   '#e2e8f0',37500,9.75,7,'publicado',980,18),

  ((select id from dealers where slug='autoimport-srl'), 'kia-sportage-2024', 'Kia','Sportage',2024,'LX','Automática','Gasolina','2.0L',0,'Gris grafito','SUV',
   2150000,'nuevo',false,'Santo Domingo',true,
   'Kia Sportage 2024 nueva, cero kilómetros, garantía de agencia. Diseño moderno, tecnología de asistencia al conductor y gran eficiencia.',
   '["0 km garantía","Pantalla panorámica","Asistente de carril","Climatizador","Arranque por botón","Apple CarPlay"]'::jsonb,
   '#334155',48900,8.95,7,'publicado',1520,30),

  ((select id from dealers where slug='top-auto-rd'), 'mazda-cx5-2018', 'Mazda','CX-5',2018,'Touring','Automática','Gasolina','2.5L',68000,'Blanco perla','SUV',
   1040000,'usado',false,'La Romana',true,
   'Mazda CX-5 Touring 2018 muy cuidada, interior impecable. Excelente relación precio-calidad, apta para financiamiento con inicial baja.',
   '["Cuero y tela","Cámara de retroceso","Sensores traseros","Bluetooth","Cruise control","Rines de aleación"]'::jsonb,
   '#f1f5f9',23600,10.25,6,'reservado',640,15),

  ((select id from dealers where slug='auto-america'), 'hyundai-tucson-2022', 'Hyundai','Tucson',2022,'Limited','Automática','Gasolina','2.0L',21000,'Negro','SUV',
   1980000,'usado',true,'Santo Domingo',true,
   'Hyundai Tucson Limited 2022 full equipo, poco uso, como nueva. Tecnología de punta y excelente confort para la ciudad.',
   '["Techo panorámico","Asientos ventilados","Pantalla digital","Cámara 360","Carga inalámbrica","Keyless"]'::jsonb,
   '#1f2937',44200,9.25,7,'publicado',720,20),

  ((select id from dealers where slug='autoimport-srl'), 'nissan-sentra-2021', 'Nissan','Sentra',2021,'SR','Automática','Gasolina','2.0L',39000,'Rojo','Sedán',
   890000,'usado',false,'Santiago',true,
   'Nissan Sentra SR 2021 deportivo, muy económico en combustible. Ideal como primer vehículo financiado.',
   '["Pantalla táctil","Cámara de retroceso","Rines deportivos","Bluetooth","Modo Sport","Faros LED"]'::jsonb,
   '#991b1b',20100,10.5,6,'publicado',410,16)
on conflict (slug) do nothing;
