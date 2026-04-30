# Testing Stripe payments locally

Grimoire's payment flow (subscriptions, credit packs) runs against Stripe. This guide lets you test the entire checkout → webhook → balance-update cycle without spending real money.

## Prerequisites

- [Stripe CLI](https://stripe.com/docs/stripe-cli) installed (`brew install stripe/stripe-cli/stripe`)
- Logged in: `stripe login`
- Access to the [Stripe Dashboard](https://dashboard.stripe.com) (toggle **Test mode** top-right)

---

## One-time setup

### 1. Copy the env template

```bash
cp .env.test.example .env.test
```

Open `.env.test` and fill in your test-mode secret key from the Stripe Dashboard (`sk_test_…`).

### 2. Create test-mode products and prices

Run the existing setup scripts against your test key:

```bash
STRIPE_SECRET_KEY=$(grep STRIPE_SECRET_KEY .env.test | cut -d= -f2) \
  node scripts/stripe-setup.mjs

STRIPE_SECRET_KEY=$(grep STRIPE_SECRET_KEY .env.test | cut -d= -f2) \
  node scripts/stripe-setup-credit-packs.mjs
```

Each script prints the generated price IDs. Copy them into `.env.test`:

```
STRIPE_PRO_MONTHLY_PRICE_ID=price_test_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_test_...
STRIPE_CREDIT_PACK_STARTER_PRICE_ID=price_test_...
STRIPE_CREDIT_PACK_STANDARD_PRICE_ID=price_test_...
STRIPE_CREDIT_PACK_BULK_PRICE_ID=price_test_...
```

---

## Option A — Stripe CLI forwards to production functions (recommended)

The simplest setup. Stripe sends test events to the production Edge Function, which uses test-mode secrets. No local DB needed; auth sessions work normally.

### Step 1 — Push test secrets to Supabase

```bash
supabase secrets set \
  STRIPE_SECRET_KEY="$(grep STRIPE_SECRET_KEY .env.test | cut -d= -f2)" \
  STRIPE_PRO_MONTHLY_PRICE_ID="$(grep STRIPE_PRO_MONTHLY_PRICE_ID .env.test | cut -d= -f2)" \
  STRIPE_PRO_ANNUAL_PRICE_ID="$(grep STRIPE_PRO_ANNUAL_PRICE_ID .env.test | cut -d= -f2)" \
  STRIPE_CREDIT_PACK_STARTER_PRICE_ID="$(grep STRIPE_CREDIT_PACK_STARTER_PRICE_ID .env.test | cut -d= -f2)" \
  STRIPE_CREDIT_PACK_STANDARD_PRICE_ID="$(grep STRIPE_CREDIT_PACK_STANDARD_PRICE_ID .env.test | cut -d= -f2)" \
  STRIPE_CREDIT_PACK_BULK_PRICE_ID="$(grep STRIPE_CREDIT_PACK_BULK_PRICE_ID .env.test | cut -d= -f2)"
```

### Step 2 — Start the Stripe CLI listener

```bash
stripe listen --forward-to https://ypdokpdpvtmyzkltnmsq.supabase.co/functions/v1/stripe-webhook
```

The CLI prints a `whsec_…` signing secret. Copy it:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

### Step 3 — Deploy functions

```bash
supabase functions deploy stripe-webhook stripe-create-checkout stripe-create-credit-checkout stripe-create-portal
```

### Step 4 — Test

Open the app, navigate to `/billing`, and click **Upgrade**. Use test card:

| Card number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0341` | Charge declined |
| `4000 0025 0000 3155` | 3D Secure required |

Expiry: any future date. CVC: any 3 digits.

### Step 5 — Restore live secrets when done

```bash
# Re-apply your live keys from .env.local
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
# ... etc
supabase functions deploy stripe-webhook stripe-create-checkout stripe-create-credit-checkout stripe-create-portal
```

---

## Option B — Full local (supabase functions serve)

Use this if you need to debug function code without deploying.

### Step 1 — Start local Supabase

```bash
supabase start
```

This spins up a local PostgreSQL instance. On first run it applies all migrations automatically.

### Step 2 — Serve functions locally

```bash
supabase functions serve --env-file .env.test
```

Functions run at `http://localhost:54321/functions/v1/`.

### Step 3 — Get the webhook signing secret

```bash
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook --print-secret
```

Add the printed `whsec_…` to `.env.test` as `STRIPE_WEBHOOK_SECRET`, then restart `supabase functions serve`.

### Step 4 — Point the frontend at local functions

Add to `.env.local` temporarily (or create `.env.development.local`):

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<anon key from supabase start output>
```

> **Note:** This routes all Supabase calls (DB, auth, storage) through the local instance. You'll need to seed local data or re-authenticate against the local auth.

### Step 5 — Run the dev server

```bash
npm run dev
```

---

## Triggering webhook events manually

You can fire specific Stripe events without completing a full checkout:

```bash
# Simulate a successful subscription payment
stripe trigger invoice.payment_succeeded

# Simulate subscription cancellation
stripe trigger customer.subscription.updated

# Simulate a completed one-time purchase (credit pack)
stripe trigger checkout.session.completed
```

See `stripe trigger --help` for the full list.

---

## Troubleshooting

**`stripe listen` says "Authentication failed"** — run `stripe login` first.

**Webhook events arrive but the function returns 400** — the `STRIPE_WEBHOOK_SECRET` in `.env.test` doesn't match the one printed by `stripe listen`. Restart `stripe listen`, grab the new secret, and restart `supabase functions serve`.

**"Missing Supabase environment variables"** — ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present. These are injected automatically by `supabase functions serve` from the linked project; for manual runs pass them explicitly.
