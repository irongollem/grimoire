-- Migration: plans_and_subscriptions
-- Foundation schema for the subscription/paywall system: plans reference table,
-- user_subscriptions with RLS, auto-enrol trigger for new signups, backfill for existing users.

-- ── Plans ─────────────────────────────────────────────────────────────────────
-- Reference table: quota definitions per plan. No user_id — shared across all users.
-- Missing key in quotas JSONB = unlimited (pro has empty {}).

create table public.plans (
  id                  text primary key,
  name                text        not null,
  price_monthly_cents int         not null,
  quotas              jsonb       not null default '{}'
);

alter table public.plans enable row level security;

create policy "plans_public_read" on public.plans
  for select using (true);

insert into public.plans (id, name, price_monthly_cents, quotas) values
  ('free', 'Free',    0,   '{"campaigns":1,"npcs":10,"monsters":3,"encounters":5,"scriptorium_documents":3,"notes":10}'),
  ('pro',  'Pro DM',  999, '{}');


-- ── User subscriptions ────────────────────────────────────────────────────────

create table public.user_subscriptions (
  user_id                 uuid        primary key references auth.users on delete cascade,
  plan_id                 text        not null references public.plans default 'free',
  status                  text        not null default 'active',
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;

-- Users can read their own subscription row; all writes go through service role
-- (webhook handler for Stripe events, trigger for new signups).
create policy "user_subscriptions_select" on public.user_subscriptions
  for select using (auth.uid() = user_id);

create trigger user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row execute procedure update_updated_at();


-- ── Auto-enrol trigger ────────────────────────────────────────────────────────
-- Creates a free subscription row for every new Supabase auth user.

create or replace function public.create_free_subscription()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.user_subscriptions (user_id, plan_id, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute procedure public.create_free_subscription();


-- ── Backfill existing users ───────────────────────────────────────────────────
-- Give every existing user a free subscription row if they don't already have one.

insert into public.user_subscriptions (user_id, plan_id, status)
select id, 'free', 'active'
from auth.users
on conflict (user_id) do nothing;
