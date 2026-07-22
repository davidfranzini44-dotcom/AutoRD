-- Dealer social links (instagram / facebook / website), edited from Perfil del dealer.
alter table dealers add column if not exists social jsonb not null default '{}'::jsonb;
