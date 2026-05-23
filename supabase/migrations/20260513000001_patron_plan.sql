-- Migration: patron_plan
-- Adds the patron plan, subscription provider tracking, and patreon_tier_ids to plans

-- Patron plan row (quotas null = unlimited, same as pro)
insert into plans (id, name, quotas)
values ('patron', 'Patron', '{}')
on conflict (id) do nothing;

-- Track which Patreon tier IDs map to this plan (admin configurable)
alter table plans
  add column if not exists patreon_tier_ids jsonb default '[]'::jsonb;

-- Track which provider manages this subscription
alter table user_subscriptions
  add column if not exists subscription_provider text not null default 'stripe'
    check (subscription_provider in ('stripe', 'patreon')),
  add column if not exists patreon_member_id text unique;
