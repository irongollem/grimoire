/**
 * One-shot Stripe product + price setup for Grimoire AI Credit Packs.
 *
 * Run once per environment (test + live):
 *   node --env-file=.env.local scripts/stripe-setup-credit-packs.mjs
 *
 * After running, copy the printed price IDs into:
 *   - .env.local (STRIPE_CREDIT_PACK_*_PRICE_ID)
 *   - Supabase secrets (same names)
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY in environment.");
  process.exit(1);
}

const stripe = new Stripe(key);

const PACKS = [
  {
    name: "Grimoire AI Credits — Starter",
    description: "15 AI credits for generating NPCs, monsters, portraits, and more.",
    nickname: "Credits Starter (15)",
    envKey: "STRIPE_CREDIT_PACK_STARTER_PRICE_ID",
    credits: 15,
    eur: 500,   // €5.00
    usd: 500,
    gbp: 400,   // £4.00
  },
  {
    name: "Grimoire AI Credits — Standard",
    description: "35 AI credits — best value for regular DMs.",
    nickname: "Credits Standard (35)",
    envKey: "STRIPE_CREDIT_PACK_STANDARD_PRICE_ID",
    credits: 35,
    eur: 1000,  // €10.00
    usd: 1000,
    gbp: 800,   // £8.00
  },
  {
    name: "Grimoire AI Credits — Bulk",
    description: "80 AI credits — best per-credit price for power users.",
    nickname: "Credits Bulk (80)",
    envKey: "STRIPE_CREDIT_PACK_BULK_PRICE_ID",
    credits: 80,
    eur: 2000,  // €20.00
    usd: 2000,
    gbp: 1600,  // £16.00
  },
];

console.log("Setting up Grimoire AI Credit Packs on Stripe…\n");

const results = [];

for (const pack of PACKS) {
  // Check if product already exists
  const existing = await stripe.products.search({
    query: `name:"${pack.name}"`,
    limit: 1,
  });

  let product;
  if (existing.data.length > 0) {
    product = existing.data[0];
    console.log(`✓ Product already exists: ${product.id} — ${pack.name}`);
  } else {
    product = await stripe.products.create({
      name: pack.name,
      description: pack.description,
      metadata: { credits: String(pack.credits) },
    });
    console.log(`✓ Created product: ${product.id} — ${pack.name}`);
  }

  const price = await stripe.prices.create({
    product: product.id,
    currency: "eur",
    unit_amount: pack.eur,
    tax_behavior: "inclusive",
    // one-time payment (no recurring)
    currency_options: {
      usd: { unit_amount: pack.usd, tax_behavior: "inclusive" },
      gbp: { unit_amount: pack.gbp, tax_behavior: "inclusive" },
    },
    metadata: { credits: String(pack.credits) },
    nickname: pack.nickname,
  });
  console.log(`✓ Created price:   ${price.id} — ${pack.nickname}`);

  results.push({ pack, product, price });
}

// ── Instructions ──────────────────────────────────────────────────────────────

console.log(`
─────────────────────────────────────────────────────
Next steps:

1. Add to .env.local:
${results.map(({ pack, price }) => `   ${pack.envKey}=${price.id}`).join("\n")}

2. Set as Supabase secrets:
${results.map(({ pack, price }) => `   supabase secrets set ${pack.envKey}=${price.id}`).join("\n")}
─────────────────────────────────────────────────────
`);
