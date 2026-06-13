-- Migration: credit_bundle_system
-- PRO monthly credit bundle (use-it-or-lose-it) + permanent purchased packs as overage.
--
-- Two-bucket model on the existing append-only ledger:
--   bucket = 'subscription' → monthly allowance; RESET (not added) each billing
--            period by the stripe-webhook (expire-then-grant). Use-it-or-lose-it.
--   bucket = 'purchased'    → credit packs; permanent, never expire (overage buffer).
--
-- Spends draw subscription-first (burn the expiring credits before permanent ones);
-- the split is written as up to two ledger rows by the server (see _shared/credits.ts).
-- Total balance is still sum(delta); ai_credit_buckets exposes the two sub-totals.

-- ── 1. Per-plan monthly included credits ─────────────────────────────────────
alter table plans add column monthly_credits integer not null default 0;

-- Seed the PRO bundle (admin tunes this live on the Plans tab). ~1,500/mo ≈ 20
-- portrait images, sized to cover a typical active DM's month at ~€13/mo.
update plans set monthly_credits = 1500 where id = 'pro';
update plans set monthly_credits = 1500 where id = 'tester';
-- free stays 0.

-- ── 2. Ledger bucket column ──────────────────────────────────────────────────
alter table ai_credit_ledger
  add column bucket text not null default 'purchased'
  check (bucket in ('subscription', 'purchased'));

-- Existing monthly top-ups become subscription-bucket; everything else (pack
-- purchases, spends, byok logs) stays 'purchased'. No paid users yet, so this is
-- effectively a no-op — included for correctness if any rows exist.
update ai_credit_ledger set bucket = 'subscription' where reason = 'subscription_topup';

-- ── 3. Bucket-balance view (for display + subscription-first spend math) ──────
create view ai_credit_buckets
  with (security_invoker = true)
as
select
  user_id,
  coalesce(sum(delta) filter (where bucket = 'subscription'), 0) as subscription_balance,
  coalesce(sum(delta) filter (where bucket = 'purchased'),    0) as purchased_balance
from ai_credit_ledger
group by user_id;
