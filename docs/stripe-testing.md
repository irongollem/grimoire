# Testing Stripe payments locally

Grimoire's payment flow (subscriptions, credit packs) runs against Stripe. This guide lets you test the entire checkout → webhook → balance-update cycle without spending real money.

---

## Read this first: test mode and live mode share nothing

This is the thing that catches everyone, and it is not you missing something — it is a genuine wart in how Stripe is built.

**Test mode and live mode are effectively two separate accounts.** Every one of these exists twice, independently, with no link between them:

| Thing | Test | Live |
| --- | --- | --- |
| Secret key | `sk_test_…` | `sk_live_…` |
| Products and prices | separate ids | separate ids |
| Webhook endpoint | separate | separate |
| Which events that endpoint sends | separate list | separate list |
| Webhook signing secret | separate | separate |

Nothing copies from one to the other. You can get a test payment working perfectly, ship it, and have live fail — not because the code is wrong, but because live's *configuration* was never given the same settings.

**And the usual test setup cannot catch that.** `stripe listen` does **not** use your registered webhook endpoint. It creates a temporary one and forwards whatever events it is told to. So it tests your *code* and never touches the event list that live actually uses. That is precisely how, on 2026-08-01, live was missing three events the code had handlers for — including the one that grants PRO after payment — while everything "tested fine".

Two things close that gap:

**1. Make the listener use your registered endpoint's real event list.**

```bash
stripe listen --load-from-webhooks-api --forward-to https://…/functions/v1/stripe-webhook
```

Now a missing event in test-mode config shows up as an event that never arrives.

**2. Check the configuration directly, in either mode.**

```bash
STRIPE_SECRET_KEY=sk_test_... npm run stripe:check   # inspect test mode
STRIPE_SECRET_KEY=sk_live_... npm run stripe:check   # inspect live mode
```

### `npm run stripe:check`

It reads the `case "…"` list out of `supabase/functions/stripe-webhook/index.ts`, asks Stripe what that mode's endpoint is configured to send, and compares them both ways. The key you pass decides which mode it inspects. It also runs in CI before every production release.

What the failures mean:

| Message | What it means | Fix |
| --- | --- | --- |
| **The code handles these, but Stripe will never send them** | The dangerous one. A handler exists and can never run — e.g. credits are granted on `checkout.session.async_payment_succeeded`, but nobody subscribed to it, so a SEPA payment takes the money and grants nothing. | Add the events to that endpoint (Dashboard → Webhooks → the endpoint → **Update details**). |
| **Stripe sends these, but the webhook ignores them** | Harmless to money, but someone enabled an event expecting something to happen. | Handle it, or remove it from the endpoint. |
| **No webhook endpoint … points at `/functions/v1/stripe-webhook`** | That mode has no endpoint at all. Nothing will ever be recorded. | Create one — see *Creating the test-mode endpoint* below. |
| **Endpoint renders payloads at X, code expects Y** | The endpoint and the code are on different Stripe *releases*, where fields move between versions. | Read *Which version is which* below. |
| **Edge functions disagree on apiVersion** | A half-finished upgrade: some functions talk to a different Stripe API than others. | Make all `new Stripe(...)` calls pin the same version. |

## Which version is which

Three separate settings share the name "API version", and conflating them is easy:

| Setting | Where | What it governs |
| --- | --- | --- |
| `apiVersion` in `new Stripe(…)` | `supabase/functions/*/index.ts` | What we **send** — the shape of replies to *our* API calls |
| Endpoint `api_version` | Stripe Dashboard → Webhooks → endpoint | What we **receive** — the shape of webhook payloads |
| Account default | Dashboard → Workbench → Overview | Anything that pins nothing, plus Stripe-initiated billing (renewal invoices) |

The endpoint one is the one people forget, and it is the one that decides whether `event.data.object` has the fields your handler reads.

**Version names matter.** Stripe versions look like `2026-07-29.dahlia`. The suffix is the *release* (Acacia, Basil, Dahlia…). Within one release, monthly versions are backward-compatible — Stripe guarantees it. Between releases, fields move. So:

- `2026-04-22.dahlia` vs `2026-07-29.dahlia` → same release, **fine**, nothing to do.
- `2025-03-31.basil` vs `2026-07-29.dahlia` → different releases, **check it**. Basil is where `Invoice.subscription` and `Subscription.current_period_end` moved.

You cannot change an endpoint's version in place. Stripe's documented path is to create a second endpoint at the new version, run both, cut over, retire the old — and that means a new signing secret. Don't do it for a same-release difference; it is all risk and no gain.

## What each event does here

Useful when deciding whether a test actually covered the thing you changed. All thirteen must be enabled on the endpoint.

| Event | What our webhook does with it |
| --- | --- |
| `checkout.session.completed` | Subscription: activate PRO. Credit pack: grant credits **only** if `payment_status` is `paid`. |
| `checkout.session.async_payment_succeeded` | A delayed method (SEPA, Bancontact) finally settled — grant the credits now. |
| `checkout.session.async_payment_failed` | That delayed payment bounced. Nothing to reverse; logged only. |
| `invoice.payment_succeeded` | Renewal paid: mark active, extend the period, refill the monthly credit bucket. |
| `invoice.payment_failed` | Mark the subscription `past_due`. |
| `customer.subscription.created` | Records the subscription and grants PRO. Needed because Stripe now creates the subscription *after* payment, so `checkout.session.completed` can arrive without one. |
| `customer.subscription.updated` | Status, period end, and pending-cancellation flags. |
| `customer.subscription.deleted` | Back to free, clear the subscription id. |
| `price.created` / `price.updated` | Keep local price config in step with Stripe. |
| `charge.refunded` | Claw back credits for a refunded pack. |
| `charge.dispute.created` | A chargeback was opened. |
| `radar.early_fraud_warning.created` | Stripe flagged likely fraud. |

## Creating the test-mode endpoint

Test mode needs its own endpoint with the same thirteen events. Create it with the CLI so the list is copied exactly rather than clicked in by hand:

```bash
stripe webhook_endpoints create \
  --api-key sk_test_... \
  --url "https://ypdokpdpvtmyzkltnmsq.supabase.co/functions/v1/stripe-webhook" \
  --description "Grimoire (test)" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d "enabled_events[]=checkout.session.async_payment_failed" \
  -d "enabled_events[]=invoice.payment_succeeded" \
  -d "enabled_events[]=invoice.payment_failed" \
  -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "enabled_events[]=price.created" \
  -d "enabled_events[]=price.updated" \
  -d "enabled_events[]=charge.refunded" \
  -d "enabled_events[]=charge.dispute.created" \
  -d "enabled_events[]=radar.early_fraud_warning.created"
```

It returns its own `whsec_…`. That is a **different** secret from live's — set it as `STRIPE_WEBHOOK_SECRET` while testing, and put live's back afterwards.

Then confirm it took:

```bash
STRIPE_SECRET_KEY=sk_test_... npm run stripe:check
```

## Smoke-test checklist

What to actually exercise before trusting a billing change. Each line is a path that has failed before.

- [ ] `STRIPE_SECRET_KEY=sk_test_... npm run stripe:check` passes
- [ ] Subscribe with `4242 4242 4242 4242` → `user_subscriptions` gets `plan_id: pro`, `status: active`, a `stripe_subscription_id`, and a `current_period_end`
- [ ] The app shows PRO (needs **both** `plan_id` pro **and** an active/trialing status)
- [ ] Buy a credit pack → balance increases by the pack amount, exactly once
- [ ] `stripe trigger invoice.payment_succeeded` → period end extends, monthly credits refill
- [ ] Open the billing portal, cancel → `cancel_at_period_end` set, still PRO until the period ends
- [ ] Refund a pack charge in the Dashboard → credits are clawed back
- [ ] Declined card `4000 0000 0000 0341` → no PRO, no credits, no partial row

---

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

```dotenv
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
| --- | --- |
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

```dotenv
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
