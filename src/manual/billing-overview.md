---
title: Billing & Subscription
section: Campaign & Account
section_order: 16
order: 1
summary: Your plan, AI credit balance, and where to upgrade, manage payment, or buy more credits.
keywords: billing, subscription, pro, credits, stripe, plan, upgrade, cancel, downgrade
---

The Billing page shows your current plan and AI credit balance, and is where you upgrade to Pro, manage payment, or buy more credits. Open it from the account menu at the bottom of the sidebar — click your name, then **Billing** — or go straight to `/billing`. It's account-wide: one plan and one credit balance cover every campaign you DM, and only DMs see the **Billing** entry in the account menu.

## Key ideas

- **Free DM / Pro DM** — the two plans, shown as a badge at the top of the page. Free gives the full toolset with per-resource quotas (campaigns, NPCs, and more — see the table below); Pro removes those limits and adds a monthly AI credit allowance plus BYOK.
- **Monthly credits vs. purchased credits** — two separate buckets that make up your balance (see below).
- **Pending cancellation** — a subscription that's scheduled to end but hasn't yet; you keep Pro access until the date shown.

## Your current plan

The plan card shows **Free DM** or **Pro DM**, plus a status pill (**active**, **trialing**, **past_due**, etc.) once you've ever had a subscription. Below that:

- If a cancellation is scheduled, it reads **"Cancels [date] — Pro access until then"** rather than a renewal date — cancelling from the Stripe portal doesn't cut you off immediately, it lets the current billing period run out.
- Otherwise, an active Pro subscription shows its next renewal date.
- A **past_due** subscription shows a payment-failure warning; update your payment method to restore access.
- A subscription that has fully ended shows "Your Pro subscription has ended."
- If a cancellation is pending **and** you're currently over what the Free plan allows on something (campaigns, etc.), a warning box lists exactly what will be locked — not deleted — once Pro access ends, with your current count and the free-plan limit for each.
- Once you've ever become a paying customer, a **Manage billing** button opens the Stripe customer portal, where you update your payment method or cancel.

## Free plan limits

Free DM gives you every feature in Grimoire, capped per resource. Pro removes every one of these limits — nothing is deleted if you're ever over a limit, it's just locked from growing further until you're back under it or you upgrade.

| Resource | Free limit |
| --- | --- |
| Campaigns | 1 |
| NPCs | 10 |
| Notes | 10 |
| Quests | 10 |
| Locations | 10 |
| Factions | 5 |
| Deities | 5 |
| Pantheons | 3 |
| Custom monsters | 3 |
| Encounters | 5 |
| Puzzle rooms | 5 |
| Sounds | 20 |
| Soundboard pages | 1 |
| Soundboard playlists | 3 |
| Scriptorium documents | 3 |

## Upgrading to Pro

If you're eligible to upgrade (free, lapsed, or a comped beta tester moving to paid), an **Upgrade to Pro** panel appears with:

1. A side-by-side feature comparison of Free vs. Pro.
2. A **Monthly / Annual** toggle — annual shows how many months it saves compared to paying monthly — plus a currency switcher if more than one currency is available for your region.
3. The live price for the selected interval, sourced directly from Stripe (no fixed number is shown here — check this page for the current rate), and, if Pro includes a monthly AI credit allowance, a note of how many credits that is.
4. A required consent checkbox (EU withdrawal-right notice) you must tick before the upgrade button becomes clickable.
5. Click **Upgrade — [price]/month** or **/year** to start Stripe Checkout.

Taxes are calculated at checkout based on your location. You can cancel any time afterward from the billing portal's **Manage billing** button.

## AI credits

Credits power AI generation across the app — portraits, scenes, stat blocks, and more. Your balance is shown at the top of the **AI credits** card and is split into two buckets:

- **Monthly** — included with Pro, resets each billing period, use-it-or-lose-it.
- **Purchased** — bought in packs below, never expires, and tops up regardless of plan.

### Buying more credits

Under **Buy more credits**, tick the withdrawal-right consent checkbox, then click any of the credit-pack tiles — each shows its credit amount and live price (with a currency switcher if applicable). Taxes are calculated at checkout. A **Credits added to your account** banner confirms a successful purchase when you're returned to this page. You can also buy a pack without coming here: any generator that's short on credits offers the same packs in its **Not enough credits** window — see [AI Generation & Credits](#ai-generation-credits).

## What your players see

Nothing — billing and AI credits are entirely DM-account-scoped. Players never see this page, never see your plan, and never spend your credits directly; AI generation they trigger from the player portal still draws from your account's balance.

## Tips

> BYOK (bring your own API key) — connecting your own OpenAI or Gemini key so that provider bills you instead of Grimoire credits — is a **Pro-only** feature, configured per campaign under **Campaign Settings → AI Assistant**, not here. See [Campaign Settings](#campaign-settings).

- A complimentary beta-tester account counts as Pro, and can still start a real paid Pro checkout at any time from this page.
- Cancelling from the Stripe portal schedules an end-of-period cancellation — you are never cut off mid-period.
- If a pending cancellation would put you over a free-plan limit, the impact list on this page tells you exactly what gets locked (never deleted) once it lands.

## Related

- [Campaign Settings](#campaign-settings)
- [AI Generation & Credits](#ai-generation-credits)
- [Your Account](#your-account)
