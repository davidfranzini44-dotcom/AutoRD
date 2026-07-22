-- Per-vehicle listing currency (dealer chooses DOP or USD).
alter table vehicles add column if not exists currency text not null default 'DOP';
alter table vehicles add constraint vehicles_currency_chk check (currency in ('DOP','USD')) not valid;
