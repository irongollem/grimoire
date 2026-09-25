---
title: AI Generation & Credits
section: Getting Started
section_order: 0
order: 4
summary: How AI generation is switched on, paid for, and configured per campaign.
keywords: ai, credits, byok, api key, generation, cost, billing, openai, gemini, local mode
---

Grimoire can generate NPCs, monsters, items, spells, quests, puzzles, and more with AI, plus narrative and scene art for the Chronicler. **Every plan can use it.** Turn the campaign's AI Assistant on and every **Generate with AI** button you'll find around the app runs for real, billed to credits (Free the same as Pro). Each one shows its credit cost before you confirm, and offers a **Buy credits** link if your balance is short instead of failing outright. Where AI is switched on, and where the Pro extras (BYOK, provider choice, the setting prompt) live, is **Campaign Settings → AI Assistant**.

## Key ideas

| Term | What it means |
| --- | --- |
| **AI Assistant toggle** | A per-campaign on/off switch, available on every plan. Turning it off hides every AI generation button across the campaign: useful if your table wants a fully hand-crafted experience. |
| **Credits** | Grimoire's built-in currency for AI calls billed to the platform's own keys. Buy packs on any plan (they never expire) and Pro also gets a monthly allowance on top. |
| **BYOK (Bring Your Own Key)** | Pro only. Store your own OpenAI or Google Gemini key; calls then bill your own provider account instead of spending credits. |
| **Local Mode** | A BYOK option: keep your key only in this browser (never sent to Grimoire's servers) instead of encrypted in your account. |

A complimentary beta-tester account (occasionally handed out by the maintainer) counts as Pro everywhere in this page.

## Turning AI on

1. Open **Campaign Settings → AI Assistant**.
2. Flip the **AI Assistant** toggle on. The first time any account does this, a consent notice (required under the EU AI Act) appears: read and confirm it. After that, toggling on/off for any campaign is immediate.
3. Key storage, your own provider keys, the setting prompt, usage stats, and the Chronicler promotion opt-in (the **BYOK** part of this tab) are Pro only, and only appear once the toggle is on. On Free, that part of the tab shows a message that those extras are Pro; generation itself still works from the toggle above.

The toggle itself is visible on every plan, and controls generation on every plan: it's only the BYOK section beneath it that stays Pro-only.

## Credits

Credits are Grimoire's built-in currency for AI generation using the platform's own API keys.

- **Every plan** generates with AI on credits by default, once the AI Assistant toggle is on: buy packs from the Billing page as you need them (see [Billing & Subscription](#billing-subscription)).
- **Pro plan** accounts also get a monthly credit allowance on top of any purchased packs, and can swap credits for a personal key (see BYOK below).

Your balance and the credit packs available to purchase are on the **Billing** page: open your account menu (click your name at the bottom of the sidebar) and choose **Billing**. Every generate button shows its own cost (a credits badge next to it) before you confirm, so this manual won't quote a number that could drift out of date; costs come from a live pricing table, not a hardcoded constant.

## When you run out of credits

You never have to leave what you're doing to top up. Click any **Generate** button when your balance is too low (or the **Get credits** link next to the red cost) and a **Not enough credits** window opens right there:

1. It tells you what the generation costs and what your balance is.
2. **On Free**, it first suggests **Pro**, which includes a batch of credits every month and removes the Free limits. Tick the withdrawal-right checkbox and click **Subscribe** (monthly, or the yearly link below it).
3. **Buy a credit pack**: tick its checkbox and click a pack. On Pro this is the only option shown.
4. Checkout opens in Stripe. When you've paid, it brings you straight back to the page you were on, with a confirmation message. Your generator's settings are not kept across checkout, so you may need to fill them in again.

Or close it with **Maybe later**. If you've reached a Free-plan limit (say, you already have 10 NPCs), you'll see the plan-limit message instead: there's no point buying credits for something the plan won't let you save.

## BYOK (Bring Your Own Key): Pro only

On the **AI Assistant** tab, Pro campaigns get two extra sections once AI is on:

### Key Storage Mode

- **Store keys locally on this device only** (unchecked by default): leave it off and a key you enter is encrypted and stored with your campaign, available from any device. Check it and the key is encrypted and kept only in this browser's local storage instead: nothing is sent to Grimoire's servers, but you'll need to re-enter it on another browser or device.

### API Keys · BYOK

Enter a key for **OpenAI** or **Google Gemini** (each has a **Get key →** link to that provider's key page). A stored key can be **Clear**ed (falls back to platform credits) with an **Undo** available before you save. Leaving a field blank keeps whatever's already stored.

Once at least one key is entered, the **Active Providers** section lets you choose, separately:

- **Text generation**: used for NPCs, monsters, items, spells, and puzzles. Without a key, this is fixed to the platform's own model, billed in credits. With a key, pick which provider handles it.
- **Image generation**: used for portraits and artwork. Shows the approximate credit cost and rendering speed for whichever provider is selected, even when you're not paying credits for it.

With any BYOK key active for a given kind of generation (text or image), that kind is billed to your own provider account: no credits are deducted for it.

### When BYOK is not available

- Free plans generate with AI, but not with a personal key: BYOK doesn't apply, so the tab shows a Pro-upgrade message in place of these sections, whatever the toggle is set to.
- If you downgrade from Pro, a previously stored key stays saved but stops being used: generation falls back to credits automatically.

## Other things on the AI Assistant tab

Pro only, and only once the **AI Assistant** toggle is on:

- **Campaign Setting Prompt**: free text describing your world's tone and visual style, included in every generation request so content stays consistent. A **Load … Defaults** button appears when your chosen setting has one.
- **Your AI Usage**: a running total of credits spent per generation, shown for platform-credit campaigns (BYOK calls are billed by your provider, not tracked here).
- **Chronicler Promotion**: an opt-in checkbox letting Grimoire feature your campaign's AI-generated Chronicler scene illustrations in its own gallery or marketing. Off by default; your campaign name, notes, and player data are never shared either way.

## What your players see

Nothing here: AI configuration is entirely DM-only. Players see the *results* (an NPC's portrait, a generated item) exactly like any other campaign content, with no indication of how it was paid for.

## Tips

> If image generation is greyed out with "No provider available," a BYOK image key was cleared without a platform provider configured: enter a key or ask an admin to check the platform's image provider setup.

- Turning the **AI Assistant** toggle off is the fastest way to run a fully hand-authored campaign without generation buttons cluttering every screen, on any plan. Turn it back on and every **Generate with AI** button works again, billed to credits unless you've set up BYOK (Pro).
- Switching between Local Mode and account-encrypted storage migrates your existing key automatically the next time you save: you won't be forced to re-enter it just because you toggled the checkbox.

## Related

- [Welcome to Grimoire](#welcome-to-grimoire)
- [Campaign Settings](#campaign-settings)
- [Importing an Adventure](#importing-an-adventure)
- [Billing & Subscription](#billing-subscription)
- [Party Tracker](#party-tracker)
