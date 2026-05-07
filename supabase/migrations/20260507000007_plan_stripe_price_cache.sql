-- Migration: plan_stripe_price_cache
-- Cache Stripe price data (monthly/annual unit_amount + currency) in plans table

alter table plans
  add column if not exists stripe_monthly_unit_amount integer,
  add column if not exists stripe_annual_unit_amount  integer,
  add column if not exists stripe_currency            text;
