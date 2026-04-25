-- Migration: add_tester_plan
-- Beta testers / comped users get unlimited access without a Stripe subscription.
-- Distinct from 'pro' so testers are identifiable in analytics and the billing page
-- can show "Beta Tester" rather than "Pro DM".

insert into public.plans (id, name, stripe_price_id, quotas) values
  ('tester', 'Beta Tester', null, '{}');
