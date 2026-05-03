/**
 * One-shot Stripe product + price setup for Grimoire Pro.
 *
 * Live:  node --env-file=.env.local scripts/stripe-setup.mjs
 * Test:  STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
 *        (see docs/stripe-testing.md for full local test setup)
 *
 * After running, copy the printed price IDs into:
 *   - Supabase secrets (STRIPE_PRO_MONTHLY_PRICE_ID, STRIPE_PRO_ANNUAL_PRICE_ID)
 *   - plans table:  UPDATE plans SET stripe_price_id = '<monthly_id>' WHERE id = 'pro';
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY in environment.");
  process.exit(1);
}

const stripe = new Stripe(key);

const MONTHLY_EUR = 1299; // €12.99
const ANNUAL_EUR  = 9900; // €99.00
const MONTHLY_USD = 1299;
const ANNUAL_USD  = 9900;
const MONTHLY_GBP = 1099; // £10.99
const ANNUAL_GBP  = 8400; // £84.00

console.log("Setting up Grimoire Pro on Stripe…\n");

// ── Product ──────────────────────────────────────────────────────────────────

const existing = await stripe.products.search({ query: 'name:"Grimoire Pro"', limit: 1 });
let product;
if (existing.data.length > 0) {
  product = existing.data[0];
  console.log(`✓ Product already exists: ${product.id}`);
} else {
  product = await stripe.products.create({
    name: "Grimoire Pro",
    description: "Unlimited campaigns, NPCs, monsters, encounters, and more.",
  });
  console.log(`✓ Created product: ${product.id}`);
}

// ── Monthly price ─────────────────────────────────────────────────────────────

const monthly = await stripe.prices.create({
  product: product.id,
  currency: "eur",
  unit_amount: MONTHLY_EUR,
  tax_behavior: "inclusive",
  recurring: { interval: "month" },
  currency_options: {
    usd: { unit_amount: MONTHLY_USD, tax_behavior: "inclusive" },
    gbp: { unit_amount: MONTHLY_GBP, tax_behavior: "inclusive" },
  },
  nickname: "Pro monthly",
});
console.log(`✓ Created monthly price: ${monthly.id}`);

// ── Annual price ──────────────────────────────────────────────────────────────

const annual = await stripe.prices.create({
  product: product.id,
  currency: "eur",
  unit_amount: ANNUAL_EUR,
  tax_behavior: "inclusive",
  recurring: { interval: "year" },
  currency_options: {
    usd: { unit_amount: ANNUAL_USD, tax_behavior: "inclusive" },
    gbp: { unit_amount: ANNUAL_GBP, tax_behavior: "inclusive" },
  },
  nickname: "Pro annual",
});
console.log(`✓ Created annual price:   ${annual.id}`);

// ── Instructions ──────────────────────────────────────────────────────────────

console.log(`
─────────────────────────────────────────────────────
Next steps:

1. Set Supabase secrets:
   supabase secrets set STRIPE_PRO_MONTHLY_PRICE_ID=${monthly.id}
   supabase secrets set STRIPE_PRO_ANNUAL_PRICE_ID=${annual.id}

2. Set monthly price ID on the pro plan row:
   UPDATE plans SET stripe_price_id = '${monthly.id}' WHERE id = 'pro';

3. Add to .env.local for local testing:
   STRIPE_PRO_MONTHLY_PRICE_ID=${monthly.id}
   STRIPE_PRO_ANNUAL_PRICE_ID=${annual.id}
─────────────────────────────────────────────────────
`);
