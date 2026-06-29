-- Migration: credit_refund_tracking
-- Refund/clawback bookkeeping on the append-only credit ledger.
--
-- A `pack_refund` row reverses one specific purchase. It cannot reuse
-- stripe_payment_intent_id — that column is uniquely indexed for grant
-- idempotency (ai_credit_ledger_payment_intent_unique), so a second row with the
-- same PI would be rejected. Instead:
--   * refunded_payment_intent_id → links the clawback to the purchase it reverses
--     (used by the FIFO lot projection to attribute the reversal to that pack)
--   * stripe_refund_id           → refund idempotency key (a Stripe refund may
--     only ever claw back credits once; the webhook + admin tool both write it)
--   * note                       → optional admin context (e.g. override reason)

alter table ai_credit_ledger
  add column if not exists stripe_refund_id text,
  add column if not exists refunded_payment_intent_id text,
  add column if not exists note text;

-- A Stripe refund can only ever claw back credits once. NULLs (every non-refund
-- row) are excluded, so grants and spends are unaffected. A duplicate insert
-- (admin tool racing the charge.refunded webhook) hits this and is treated as
-- already-processed (unique violation 23505).
create unique index if not exists ai_credit_ledger_refund_unique
  on ai_credit_ledger (stripe_refund_id)
  where stripe_refund_id is not null;
