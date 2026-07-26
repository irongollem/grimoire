# Features — Miscellaneous

Shipped features in the **Miscellaneous** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] **AI credit pack one-time purchase via Stripe** (irongollem/grimoire#290) — `stripe-setup-credit-packs.mjs` script creates 3 Stripe products (Starter 15cr €5, Standard 35cr €10, Bulk 80cr €20); `stripe-create-credit-checkout` Edge Function creates a one-time Checkout Session with `user_id` + `credits` in metadata; `stripe-webhook` handles `checkout.session.completed` in `payment` mode, inserting into `ai_credit_ledger` with idempotency on `stripe_payment_intent_id`; `useAiCredits.purchasePack()` calls the Edge Function and redirects; credit pack grid in BillingView; success banner shown on return from Stripe (`?credit_purchase=success`); price IDs configured as Supabase secrets.
