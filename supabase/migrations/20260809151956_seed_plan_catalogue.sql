-- Migration: seed_plan_catalogue
-- Give a fresh database the three plan rows that `create_free_subscription()`
-- has always assumed exist, so signup works before anything is dumped into it.

-- `public.plans` is reference data — a catalogue of what we sell, not something
-- a user creates — but it was the only such table with no migration behind it.
-- The rows lived in production, and locally they arrived through `seed.sql`.
-- A fresh database got none, so the very first `insert into auth.users` fired
-- `create_free_subscription()` and hit:
--
--   insert or update on table "user_subscriptions" violates foreign key
--   constraint "user_subscriptions_plan_id_fkey"
--   DETAIL: Key (plan_id)=(free) is not present in table "plans".
--
-- The hole was there for as long as the function was, and stayed invisible
-- because nothing on a fresh database ever ran the trigger: the two
-- `auth.users` bindings existed only in production until `20260809143816`
-- captured them. Capturing them is what made a real gap start failing — the
-- same shape as the profiles bug recorded in that migration, and the same
-- cause. Seed data standing in for schema hides exactly the thing a fresh
-- replay is supposed to prove.
--
-- `on conflict do nothing`, deliberately: production's rows carry live Stripe
-- price ids and unit amounts synced from Stripe by `npm run stripe:setup` and
-- the webhook, and an `on conflict do update` here would overwrite that live
-- state with whatever this file happened to say on the day it was written.
-- This migration's job is to make an *empty* catalogue non-empty; keeping an
-- existing one current is Stripe's job, not a migration's.
--
-- For the same reason the Stripe columns are left null rather than seeded. A
-- fresh database genuinely has no Stripe configuration, `resolveAmount()`
-- already returns null for a plan with no amount, and a hard-coded price in a
-- migration is a number that goes stale silently the next time pricing moves.

insert into public.plans (id, name, quotas, monthly_credits)
values
  (
    'free',
    'Free',
    -- Mirrors production. The free tier is the one plan whose quotas are
    -- product policy rather than Stripe state, so it belongs in the schema.
    jsonb_build_object(
      'campaigns', 1,
      'deities', 5,
      'encounters', 5,
      'factions', 5,
      'locations', 10,
      'monsters', 3,
      'notes', 10,
      'npcs', 10,
      'pantheons', 3,
      'puzzle_rooms', 5,
      'quests', 10,
      'scriptorium_documents', 3,
      'soundboard_pages', 1,
      'soundboard_playlists', 3,
      'sounds', 20
    ),
    0
  ),
  -- An empty `quotas` object means unlimited — both paid plans lift every cap.
  ('pro', 'Pro DM', '{}'::jsonb, 1500),
  -- Granted by 'tester' and 'admin' invites in `create_free_subscription()`;
  -- PRO-equivalent access without a Stripe subscription behind it.
  ('tester', 'Beta Tester', '{}'::jsonb, 500)
on conflict (id) do nothing;
