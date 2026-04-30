-- Migration: ai_credit_ledger
-- Creates ai_credit_ledger table and ai_credit_balance view for tracking AI generation credits

create table ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  delta int not null,
  reason text not null,
  stripe_payment_intent_id text,
  subscription_period_start date,
  created_at timestamptz default now()
);

-- Users can read their own ledger rows; service role (edge functions + webhook) writes
alter table ai_credit_ledger enable row level security;

create policy "ai_credit_ledger_select"
  on ai_credit_ledger for select
  using (auth.uid() = user_id);

-- View for current balance per user (security_invoker ensures RLS on ledger applies)
create view ai_credit_balance
  with (security_invoker = true)
  as
  select user_id, coalesce(sum(delta), 0)::int as balance
  from ai_credit_ledger
  group by user_id;
