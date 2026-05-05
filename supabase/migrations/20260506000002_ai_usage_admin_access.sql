-- Migration: ai_usage_admin_access
-- Allow admins to read all ai_credit_ledger rows and the pricing reference table

-- Admin read-all policy for ai_credit_ledger
create policy "ai_credit_ledger_admin_select"
  on ai_credit_ledger
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Grant authenticated users read on ai_model_pricing (public reference data)
alter table ai_model_pricing enable row level security;

create policy "ai_model_pricing_select"
  on ai_model_pricing
  for select
  using (true);
