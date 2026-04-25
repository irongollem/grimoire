-- Migration: replace_plan_price_columns_with_prices_jsonb
-- Replace single-currency monthly_cents/yearly_cents with a prices JSONB keyed by currency code.

alter table public.plans
  drop column monthly_cents,
  drop column yearly_cents,
  add column prices jsonb not null default '{}';

-- Seed USD and EUR for the pro plan.
-- Format: { "USD": { "monthly": <cents>, "yearly": <cents> }, ... }
update public.plans
set prices = '{"USD": {"monthly": 999, "yearly": 8900}, "EUR": {"monthly": 999, "yearly": 8900}}'::jsonb
where id = 'pro';
