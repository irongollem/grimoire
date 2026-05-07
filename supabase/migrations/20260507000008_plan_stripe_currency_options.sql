-- Migration: plan_stripe_currency_options
-- Store per-currency amounts for monthly and annual plan prices

alter table plans
  add column if not exists stripe_monthly_currency_options jsonb,
  add column if not exists stripe_annual_currency_options  jsonb;
