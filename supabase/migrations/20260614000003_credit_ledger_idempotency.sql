-- Migration: credit_ledger_idempotency
-- Make the two money-critical webhook grants race-proof at the DB level. Both
-- handlers currently do check-then-insert (fine in practice, but a duplicate
-- Stripe webhook delivery racing itself could double-credit). These partial
-- unique indexes make a second insert impossible; the webhook now treats the
-- resulting unique violation (23505) as "already processed".

-- 1. A Stripe payment intent can only ever grant credits once (pack purchases).
--    NULLs (every non-purchase row) are excluded, so spends are unaffected.
create unique index ai_credit_ledger_payment_intent_unique
  on ai_credit_ledger (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- 2. A subscription can only be reset once per billing period (monthly bundle).
create unique index ai_credit_ledger_subscription_topup_unique
  on ai_credit_ledger (user_id, subscription_period_start)
  where reason = 'subscription_topup';
