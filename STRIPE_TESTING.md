# Stripe — Test-Mode Dry Run & Go-Live Checklist

A step-by-step guide to validate the billing/credit system **safely in test mode**
(no real charges) before public launch, plus the pre-launch hardening items.

> Status: live mode is already configured (price IDs set, prices synced). Test mode
> is **not** set up yet. This doc is for doing that properly, at your own pace.

---

## 0. Mental model — test vs live are two separate worlds

Stripe keeps **test mode** and **live mode** completely separate. Each has its own:

- API keys (`sk_test_…` / `rk_test_…` vs `sk_live_…` / `rk_live_…`)
- Products & **price IDs** (a test `price_…` is a different object from the live one)
- Webhook endpoints **and signing secrets** (`whsec_…`)
- Customers, subscriptions, payments

The Stripe **CLI defaults to test mode**. So `stripe trigger price.updated` fired a
*test* event — which is why it didn't touch live data. Nothing crosses over.

**Consequence:** to test the money flow without real cards, everything in the loop
(keys, prices, webhook secret, the DB rows checkout reads) must be **test-mode**.
The cleanest way to get that without disturbing production is a **local Supabase
stack** (or a staging project), described below.

---

## 1. What we're actually validating (and why)

The bank-breaking risk lives in the **credit bucket logic**, not the price display.
The must-pass scenarios:

| Scenario | Expected result |
|---|---|
| New subscription | `monthly_credits` (1,500 for Pro) lands in the **`subscription`** bucket |
| Generate / spend | drawn **subscription-first**, splits into `purchased` only when it crosses the boundary |
| Renewal (next period) | subscription bucket **resets to the allowance** — does NOT accumulate (use-it-or-lose-it) |
| Buy a credit pack | lands in the **`purchased`** bucket; **permanent** (never expires) |
| Duplicate webhook delivery | no double-credit (idempotency unique indexes + `23505` handling) |
| Price edited in Stripe | cached display amount updates (`price.updated` webhook) — *display only; nice-to-have* |
| Cancel | plan drops to `free`; purchased credits remain |

Key facts about how it works (see `supabase/functions/stripe-webhook/index.ts`):

- The **initial grant and every renewal** happen on `invoice.payment_succeeded`
  (`topUpSubscriptionCredits` → resets the subscription bucket to the plan's
  `monthly_credits`, idempotent per period).
- `checkout.session.completed` sets `plan_id = 'pro'` on `user_subscriptions`.
- The allowance is read from `plans.monthly_credits` — **independent of price IDs**,
  so the credit logic can be tested even if price IDs differ.

---

## 2. Prerequisites

- Stripe CLI installed & authenticated (`stripe login`) — ✅ done
- Supabase CLI installed (`supabase --version`)
- Docker running (needed for the local Supabase stack)

---

## 3. Recommended setup — local Supabase + Stripe test mode (full isolation)

This keeps **production untouched**: a throwaway local DB, test Stripe keys, test prices.

### 3a. Create test-mode products & prices in Stripe

In the **Stripe Dashboard, toggle to Test mode** (top-right), then recreate the 4 prices
(or use the CLI). You need: PRO monthly, PRO annual, and the 3 packs.

```bash
# Example (test mode is the CLI default). Repeat per price; note each test price_… id.
stripe products create --name "Grimoire Pro"
stripe prices create --product prod_XXX --currency eur --unit-amount 1299 \
  --recurring.interval month
stripe prices create --product prod_XXX --currency eur --unit-amount 9900 \
  --recurring.interval year
# Packs (one-time):
stripe products create --name "Starter pack" && stripe prices create --product prod_YYY --currency eur --unit-amount 500
# …standard (1000) and bulk (2000) the same way
```

### 3b. Start the local stack and point its DB at the test price IDs

```bash
supabase start          # spins up local Postgres + applies supabase/migrations
supabase functions serve --no-verify-jwt --env-file supabase/.env.stripe-test
```

Put the **test** price IDs into the **local** DB (this does NOT touch production):

```sql
-- run against the LOCAL db (supabase start prints the local connection string;
-- or use: supabase db query / psql on the local port, usually 54322)
update plans set stripe_price_id = 'price_TESTmonthly',
                 stripe_annual_price_id = 'price_TESTannual' where id = 'pro';
update credit_pack_config set stripe_price_id = 'price_TESTstarter'  where pack_id = 'starter';
update credit_pack_config set stripe_price_id = 'price_TESTstandard' where pack_id = 'standard';
update credit_pack_config set stripe_price_id = 'price_TESTbulk'     where pack_id = 'bulk';
```

### 3c. The function env file

Create `supabase/.env.stripe-test` (⚠️ **git-ignore it** — see §7 security):

```
STRIPE_SECRET_KEY=rk_test_…          # restricted test key (see §7), or sk_test_ to start
STRIPE_WEBHOOK_SECRET=whsec_…        # from `stripe listen`, see 3d
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=…                  # from `supabase start` output
SUPABASE_SERVICE_ROLE_KEY=…          # from `supabase start` output
```

### 3d. Forward Stripe test events to the local function

```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```

Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` and restart `functions serve`.
(`stripe listen` uses its own signing secret — that's why it must match here.)

### 3e. Run the app locally

```bash
npm run dev
```

Hosted Stripe Checkout doesn't need a publishable key on the client (the edge
function creates the session and returns a URL the browser redirects to), so the
only Stripe config that matters is the function env above. Just make sure the app's
Supabase env points at the local stack.

> **Quicker but messier alternative:** skip `supabase start` and serve the function
> against the **production** DB (real `SUPABASE_URL`/service role) using a dedicated
> test user. It works, but it writes test rows into prod and you'd have to set test
> price IDs on the real `plans` rows — avoid unless you clean up carefully (§6).

---

## 4. The dry run — step by step (verify after each)

Sign in to the local app as a test user. Use Stripe test card **`4242 4242 4242 4242`**,
any future expiry, any CVC/postal.

### 4a. Subscribe → bundle granted
1. Go to Billing → upgrade to Pro → complete checkout with the test card.
2. Watch the `stripe listen` terminal: you should see `checkout.session.completed`
   then `invoice.payment_succeeded` delivered with `200`.
3. **Verify** (against the DB you're testing):

```sql
select * from ai_credit_buckets where user_id = '<test-user-uuid>';
-- expect subscription_balance = 1500, purchased_balance = 0
select plan_id, status from user_subscriptions where user_id = '<test-user-uuid>';
-- expect plan_id = 'pro', status = 'active'
```

### 4b. Spend → subscription-first, boundary split
Generate a few images/NPCs in the app, then:

```sql
select bucket, sum(delta) from ai_credit_ledger
where user_id = '<test-user-uuid>' group by bucket;
-- subscription should drop first; purchased only goes negative-from after sub hits 0
select subscription_balance, purchased_balance from ai_credit_buckets
where user_id = '<test-user-uuid>';
```

### 4c. Buy a pack → permanent bucket
Buy the Starter pack with the test card, then:

```sql
select subscription_balance, purchased_balance from ai_credit_buckets
where user_id = '<test-user-uuid>';
-- purchased_balance should increase by 400 and stay (it never resets)
```

### 4d. Renewal → reset (the critical one) via Test Clocks
The proper way to fast-forward a billing period without waiting a month:

```bash
# Create a test clock, then create the customer/subscription ON that clock.
# Easiest via Dashboard (Test mode → Billing → Subscriptions → "Test clock"),
# or CLI:
stripe test_helpers test_clocks create --frozen-time $(date +%s)
# attach customer + subscription to the clock, then advance ~1 month:
stripe test_helpers test_clocks advance <clock_id> --frozen-time <ts+32days>
```

This fires a renewal `invoice.payment_succeeded`. **Verify the reset:**

```sql
select subscription_balance from ai_credit_buckets where user_id = '<test-user-uuid>';
-- expect EXACTLY 1500 again — NOT 1500 + leftover. Use-it-or-lose-it confirmed.
select reason, delta, subscription_period_start from ai_credit_ledger
where user_id = '<test-user-uuid>' and reason = 'subscription_topup'
order by created_at;
-- expect one topup row per period
```

### 4e. Idempotency — re-fire and confirm no double-credit
Re-send the last renewal invoice event (Dashboard → event → "Resend", or re-advance):

```sql
select count(*) from ai_credit_ledger
where user_id = '<test-user-uuid>' and reason = 'subscription_topup'
  and subscription_period_start = '<that-period>';
-- expect 1 (the unique index + 23505 handling prevents a duplicate)
```

### 4f. Price-sync (display only, low priority)
Edit a **test** price's amount in the Dashboard → expect `price.updated` in the
`stripe listen` log → verify:

```sql
select id, stripe_monthly_unit_amount from plans where id = 'pro';
-- should match the new amount
```

### 4g. Cancel
Cancel via the billing portal / Dashboard → expect `customer.subscription.deleted` →

```sql
select plan_id from user_subscriptions where user_id = '<test-user-uuid>';
-- expect 'free'; purchased_balance should still be intact
```

---

## 5. Edge cases worth a look

- Insufficient balance: spend down to ~0 and confirm generation is blocked with the
  402 "insufficient credits" path (pre-flight check).
- BYOK: a BYOK generation should log `delta = 0` (no charge).
- Failed payment: `stripe trigger invoice.payment_failed` → `user_subscriptions.status`
  becomes `past_due`.

---

## 6. Cleanup (only needed if you tested against the prod DB)

If you used the local stack, just `supabase stop` — nothing in prod changed. If you
tested against prod with a test user:

```sql
delete from ai_credit_ledger where user_id = '<test-user-uuid>';
update user_subscriptions set plan_id='free', status='cancelled',
  stripe_subscription_id=null, stripe_customer_id=null where user_id='<test-user-uuid>';
-- and revert any test price IDs you put on plans/credit_pack_config back to live ones
```

---

## 7. Pre-launch hardening (from the Stripe best-practices skill)

- [ ] **Use a Restricted API Key (RAK), not the secret key.** Replace
  `STRIPE_SECRET_KEY` (`sk_…`) with a `rk_…` scoped to least privilege. The functions
  need: **Checkout Sessions** (write), **Customers** (write), **Billing Portal**
  (write), **Subscriptions** (read), **Prices/Products** (read), **PaymentIntents**
  (read). Create **separate keys for test and live**. Webhook signature verification
  does **not** need an API key.
- [ ] **Never commit keys.** Add `supabase/.env.stripe-test` (and any `.env*`) to
  `.gitignore`; consider a pre-commit hook that blocks `sk_`/`rk_` strings.
- [ ] **Webhook signature verification** — already in place (`constructEventAsync`
  with `STRIPE_WEBHOOK_SECRET`). ✅
- [ ] (Optional) **IP-allowlist** Stripe's published IPs on the webhook endpoint for
  defense in depth.
- [ ] **Live webhook endpoint events** — confirm `price.created`, `price.updated`,
  `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`,
  `customer.subscription.updated`, `customer.subscription.deleted` are all enabled:
  ```bash
  stripe webhook_endpoints list --live
  ```
- [ ] Run the official **[Go-Live checklist](https://docs.stripe.com/get-started/checklist/go-live)**.
- [ ] After switching the deployed function to **live** RAK + live `whsec`, do one
  controlled **live** smoke test (real card on the €5 pack, then refund) to prove the
  production path before announcing.

---

## 8. Reference — the moving parts in this repo

- **Webhook:** `supabase/functions/stripe-webhook/index.ts`
  (events handled, `topUpSubscriptionCredits` reset, `syncPriceCacheFromStripe`,
  `creditPackPurchase`)
- **Checkout:** `stripe-create-checkout` (subscription), `stripe-create-credit-checkout`
  (packs — reads `credits` + `stripe_price_id` from DB, never the client),
  `stripe-create-portal`
- **Spend logic:** `supabase/functions/_shared/credits.ts` (`recordSpend`,
  subscription-first) + pure math in `_shared/credit-math.ts` (unit-tested in
  `credit-math.test.ts`)
- **Tables/views:** `plans` (`monthly_credits`, price IDs), `credit_pack_config`,
  `ai_credit_ledger` (`bucket`, `subscription_period_start`, `stripe_payment_intent_id`),
  `ai_credit_buckets` (view), `user_subscriptions`
- **Migrations:** `20260614000001` (bundle system), `…02` (pack resize),
  `…03` (idempotency unique indexes)
- **Webhook URL:** `https://ypdokpdpvtmyzkltnmsq.supabase.co/functions/v1/stripe-webhook`
- **Current config:** Pro €12.99/mo, €99/yr, 1,500 credits/mo · packs 400/1,000/2,600 @ €5/€10/€20 · tester 500 credits/mo
