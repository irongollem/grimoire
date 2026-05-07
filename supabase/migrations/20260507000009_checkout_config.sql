-- Migration: checkout_config
-- Singleton table for global checkout settings

create table checkout_config (
  id boolean primary key default true,
  promo_codes_enabled boolean not null default false,
  constraint checkout_config_singleton check (id)
);

insert into checkout_config (id, promo_codes_enabled) values (true, false);

alter table checkout_config enable row level security;

create policy "checkout_config_public_read" on checkout_config for select using (true);
