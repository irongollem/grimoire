-- Migration: plans_replace_price_with_stripe_id
-- price_monthly_cents is not authoritative (Stripe is, and prices vary by currency/tax).
-- Replace with stripe_price_id so the checkout Edge Function has the correct reference.

alter table public.plans
  drop column price_monthly_cents,
  add column stripe_price_id text;
