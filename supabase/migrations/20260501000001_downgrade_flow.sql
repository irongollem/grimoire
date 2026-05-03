-- Migration: downgrade_flow
-- Adds pending-cancellation tracking to user_subscriptions and archived flag to campaigns

alter table user_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancel_at timestamptz;

alter table campaigns
  add column if not exists is_archived boolean not null default false;
