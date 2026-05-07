-- Migration: stripe_price_cache
-- Cache Stripe price data (unit_amount, currency, currency_options) in credit_pack_config

alter table credit_pack_config
  add column if not exists stripe_unit_amount integer,
  add column if not exists stripe_currency text,
  add column if not exists stripe_currency_options jsonb;
