-- Migration: credit_pack_stripe_ids
-- Add Stripe product and price ID columns to credit_pack_config.
-- Storing these in DB (not env vars) allows the admin panel to manage them directly.

alter table credit_pack_config
  add column stripe_product_id text,
  add column stripe_price_id    text;
