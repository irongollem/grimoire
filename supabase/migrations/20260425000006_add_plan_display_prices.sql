-- Migration: add_plan_display_prices
-- Marketing display prices for the UI (not authoritative for billing — Stripe is).
-- monthly_cents and yearly_cents are what we show users; keep them in sync with
-- the Stripe price when pricing changes.

alter table public.plans
  add column monthly_cents int,
  add column yearly_cents  int;

update public.plans
set monthly_cents = 999, yearly_cents = 8900
where id = 'pro';
