#!/usr/bin/env bash
# Monetization flow test script
# Requires: stripe CLI (authenticated), supabase CLI (linked to project)
#
# Usage:
#   TEST_USER_ID=<uuid> bash scripts/test-monetization.sh
#
# Get a test user ID from: supabase db execute --sql "select id, email from auth.users limit 10"

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${BLUE}→ $1${NC}"; }
manual() { echo -e "${YELLOW}⚠ MANUAL: $1${NC}"; }

if [[ -z "${TEST_USER_ID:-}" ]]; then
  echo "Set TEST_USER_ID to a real user UUID first:"
  echo '  supabase db execute --sql "select id, email from auth.users limit 10"'
  exit 1
fi

db() { supabase db execute --sql "$1" 2>/dev/null | tail -n +3; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Grimoire Monetization Test Suite"
echo "  User: $TEST_USER_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 0. Baseline ────────────────────────────────────────────────────────────────
info "Recording baseline credit balance..."
BASELINE=$(db "select coalesce(sum(delta),0) as bal from ai_credit_ledger where user_id='$TEST_USER_ID'" | grep -E '[0-9]' | tr -d ' ')
echo "  Baseline balance: ${BASELINE} credits"


# ── 1. Checkout config ─────────────────────────────────────────────────────────
echo ""
echo "1. Checkout config"
PROMO=$(db "select promo_codes_enabled from checkout_config" | grep -E 'true|false' | tr -d ' ')
[[ -n "$PROMO" ]] && pass "checkout_config row exists (promo_codes_enabled=$PROMO)" || fail "checkout_config row missing"


# ── 2. Webhook: credit pack purchase ──────────────────────────────────────────
echo ""
echo "2. Webhook — credit pack purchase"
FAKE_PI="pi_test_$(date +%s)"
FAKE_CREDITS=35

info "Sending mock checkout.session.completed (mode=payment) via Stripe CLI..."
stripe trigger checkout.session.completed \
  --override checkout_session:mode=payment \
  --override checkout_session:metadata.user_id="$TEST_USER_ID" \
  --override checkout_session:metadata.credits="$FAKE_CREDITS" \
  --override checkout_session:metadata.pack_id=standard \
  --override checkout_session:payment_intent="$FAKE_PI" \
  2>&1 | grep -E "triggered|error|Error" || true

sleep 3  # give webhook time to process

LEDGER_ROW=$(db "select id from ai_credit_ledger where user_id='$TEST_USER_ID' and reason='pack_purchase' and stripe_payment_intent_id='$FAKE_PI'")
[[ -n "$LEDGER_ROW" ]] && pass "Credit pack ledger row created" || fail "Credit pack ledger row NOT found — webhook may not be processing payment mode"

info "Testing idempotency (replaying same payment_intent)..."
stripe trigger checkout.session.completed \
  --override checkout_session:mode=payment \
  --override checkout_session:metadata.user_id="$TEST_USER_ID" \
  --override checkout_session:metadata.credits="$FAKE_CREDITS" \
  --override checkout_session:metadata.pack_id=standard \
  --override checkout_session:payment_intent="$FAKE_PI" \
  2>&1 | grep -E "triggered|error|Error" || true

sleep 3

DUPLICATE_COUNT=$(db "select count(*) from ai_credit_ledger where user_id='$TEST_USER_ID' and stripe_payment_intent_id='$FAKE_PI'" | grep -E '[0-9]' | tr -d ' ')
[[ "$DUPLICATE_COUNT" == "1" ]] && pass "Idempotency OK — only 1 row for duplicate webhook" || fail "Idempotency BROKEN — found $DUPLICATE_COUNT rows for same payment_intent"


# ── 3. Webhook: subscription activation ───────────────────────────────────────
echo ""
echo "3. Webhook — subscription lifecycle"

# Get stripe_customer_id for the test user
CUSTOMER_ID=$(db "select stripe_customer_id from user_subscriptions where user_id='$TEST_USER_ID'" | grep -E 'cus_' | tr -d ' ')
if [[ -z "$CUSTOMER_ID" ]]; then
  manual "Test user has no Stripe customer ID yet — skip subscription webhook tests or run a real checkout first"
else
  info "Customer ID: $CUSTOMER_ID"

  info "Triggering invoice.payment_succeeded..."
  stripe trigger invoice.payment_succeeded \
    --override invoice:customer="$CUSTOMER_ID" \
    2>&1 | grep -E "triggered|error|Error" || true

  sleep 3

  TOPUP=$(db "select id from ai_credit_ledger where user_id='$TEST_USER_ID' and reason='subscription_topup' order by created_at desc limit 1")
  [[ -n "$TOPUP" ]] && pass "Subscription top-up (5 credits) credited" || fail "Subscription top-up NOT found"

  PLAN=$(db "select plan_id, status from user_subscriptions where user_id='$TEST_USER_ID'" | tail -1)
  echo "  Subscription row: $PLAN"

  info "Triggering customer.subscription.deleted (cancellation)..."
  stripe trigger customer.subscription.deleted \
    --override subscription:customer="$CUSTOMER_ID" \
    2>&1 | grep -E "triggered|error|Error" || true

  sleep 3

  PLAN_AFTER=$(db "select plan_id from user_subscriptions where user_id='$TEST_USER_ID'" | grep -E 'free|pro' | tr -d ' ')
  [[ "$PLAN_AFTER" == "free" ]] && pass "Subscription deleted → plan reverted to free" || fail "Plan after deletion: $PLAN_AFTER (expected free)"
fi


# ── 4. Stripe price IDs configured ────────────────────────────────────────────
echo ""
echo "4. Stripe price IDs"
PACKS_WITHOUT_PRICE=$(db "select count(*) from credit_pack_config where stripe_price_id is null" | grep -E '[0-9]' | tr -d ' ')
[[ "$PACKS_WITHOUT_PRICE" == "0" ]] && pass "All credit packs have stripe_price_id" || manual "$PACKS_WITHOUT_PRICE credit pack(s) missing stripe_price_id — go to Admin → Pricing → Credit Packs → Save each row"

PACKS_WITHOUT_CACHE=$(db "select count(*) from credit_pack_config where stripe_unit_amount is null" | grep -E '[0-9]' | tr -d ' ')
[[ "$PACKS_WITHOUT_CACHE" == "0" ]] && pass "All credit packs have cached Stripe price" || manual "$PACKS_WITHOUT_CACHE credit pack(s) not synced yet — click Save in Admin → Pricing to fetch from Stripe"

PRO_MONTHLY=$(db "select stripe_price_id from plans where id='pro'" | grep -E 'price_' | tr -d ' ')
[[ -n "$PRO_MONTHLY" ]] && pass "Pro plan has stripe_price_id (monthly)" || manual "Pro plan missing stripe_price_id — go to Admin → Pricing → Subscription Prices → Save"

PRO_ANNUAL=$(db "select stripe_annual_price_id from plans where id='pro'" | grep -E 'price_' | tr -d ' ')
[[ -n "$PRO_ANNUAL" ]] && pass "Pro plan has stripe_annual_price_id" || manual "Pro plan missing stripe_annual_price_id"

PRO_CACHED=$(db "select stripe_monthly_unit_amount from plans where id='pro'" | grep -E '[0-9]' | tr -d ' ')
[[ -n "$PRO_CACHED" ]] && pass "Pro plan price cached from Stripe (${PRO_CACHED} cents/mo)" || manual "Pro plan price not synced — click Save in Admin → Pricing → Subscription Prices"


# ── 5. Manual steps ────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MANUAL CHECKS (require browser + Stripe test mode)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
manual "5a. Credit pack checkout"
echo "     1. Go to /billing, click a credit pack"
echo "     2. Stripe Checkout opens — use card 4242 4242 4242 4242, any future date/CVC"
echo "     3. After payment, redirected to /billing?credit_purchase=success"
echo "     4. Green banner appears"
echo "     5. Check credit balance increased by pack amount:"
echo "        supabase db execute --sql \"select sum(delta) from ai_credit_ledger where user_id='$TEST_USER_ID'\""
echo ""
manual "5b. Promo code field"
echo "     1. Admin → Pricing → toggle Promotion Codes ON"
echo "     2. Go to /billing, click a credit pack"
echo "     3. Promo code field IS visible in Stripe Checkout"
echo "     4. Toggle OFF, repeat — promo field should be GONE"
echo ""
manual "5c. Subscription checkout"
echo "     1. Go to /billing (as free user), click Upgrade"
echo "     2. Stripe Checkout opens in subscription mode"
echo "     3. Pay with 4242 4242 4242 4242"
echo "     4. Redirect to /dashboard?checkout=success"
echo "     5. User subscription row shows plan_id=pro, status=active"
echo "     6. 5 credits added (invoice.payment_succeeded fires automatically)"
echo ""
manual "5d. Currency selector"
echo "     1. Go to /billing — currency pills appear if prices are synced"
echo "     2. Switch between EUR / GBP / USD — all prices update"
echo "     3. Same on /pricing"
echo ""
manual "5e. 402 pre-flight (zero balance)"
echo "     1. Drain credits: supabase db execute --sql \\"
echo "        \"insert into ai_credit_ledger (user_id,delta,reason) values ('$TEST_USER_ID',-9999,'test_drain')\""
echo "     2. Try to generate an NPC — should get 'Insufficient credits' error before any AI call"
echo "     3. Restore: supabase db execute --sql \\"
echo "        \"insert into ai_credit_ledger (user_id,delta,reason) values ('$TEST_USER_ID',9999,'test_restore')\""
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
