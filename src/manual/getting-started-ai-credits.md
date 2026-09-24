---
title: AI Generation & Credits
section: Getting Started
section_order: 0
order: 4
summary: How AI generation is switched on, paid for, and configured per campaign.
keywords: ai, credits, byok, api key, generation, cost, billing, openai, gemini, local mode
---

Grimoire can generate NPCs, monsters, items, spells, quests, puzzles, and more with AI — plus narrative and scene art for the Chronicler. **AI generation is a Pro feature.** On a Free plan you build almost everything by hand: nearly every **Generate with AI** button you'll find around the app still shows up, but clicking it opens an upgrade prompt instead of running. (The Party Tracker's group portrait is the one exception — see [Party Tracker](#party-tracker).) Where AI is switched on and paid for lives in **Campaign Settings → AI Assistant**.

## Key ideas

| Term | What it means |
| --- | --- |
| **AI Assistant toggle** | A per-campaign on/off switch. On a Pro plan, turning it off hides every AI generation button across the campaign — useful if your table wants a fully hand-crafted experience. On Free it has no visible effect, because generation isn't available either way. |
| **Credits** | Grimoire's built-in currency for AI calls billed to the platform's own keys. Pro campaigns get a monthly allowance plus whatever packs you've purchased (packs never expire). |
| **BYOK (Bring Your Own Key)** | Pro only. Store your own OpenAI or Google Gemini key; calls then bill your own provider account instead of spending credits. |
| **Local Mode** | A BYOK option: keep your key only in this browser (never sent to Grimoire's servers) instead of encrypted in your account. |

A complimentary beta-tester account (occasionally handed out by the maintainer) counts as Pro everywhere in this page.

## Turning AI on

1. Open **Campaign Settings → AI Assistant**.
2. Flip the **AI Assistant** toggle on. The first time any account does this, a consent notice (required under the EU AI Act) appears — read and confirm it. After that, toggling on/off for any campaign is immediate.
3. On Pro, the rest of this tab — key storage, your own provider keys, the setting prompt, usage stats, and the Chronicler promotion opt-in — only appears once the toggle is on. On Free, none of it appears; you'll see an upgrade message in its place regardless of the toggle.

The toggle itself is visible on every plan, but only changes anything for Pro campaigns.

## Credits

Credits are Grimoire's built-in currency for AI generation using the platform's own API keys.

- **Free plans** don't generate with AI at all, with one exception ([Party Tracker](#party-tracker)'s group portrait, which does spend credits) — see [Billing & Subscription](#billing-subscription) for how to move to Pro.
- **Pro plan** accounts pay with credits by default, unless a personal key is configured (see BYOK below).

Your balance and the credit packs available to purchase are on the **Billing** page — open your account menu (click your name at the bottom of the sidebar) and choose **Billing**. Every generate button shows its own cost — a credits badge next to it — before you confirm, so this manual won't quote a number that could drift out of date; costs come from a live pricing table, not a hardcoded constant.

## BYOK (Bring Your Own Key) — Pro only

On the **AI Assistant** tab, Pro campaigns get two extra sections once AI is on:

### Key Storage Mode

- **Store keys locally on this device only** (unchecked by default) — leave it off and a key you enter is encrypted and stored with your campaign, available from any device. Check it and the key is encrypted and kept only in this browser's local storage instead — nothing is sent to Grimoire's servers, but you'll need to re-enter it on another browser or device.

### API Keys · BYOK

Enter a key for **OpenAI** or **Google Gemini** (each has a **Get key →** link to that provider's key page). A stored key can be **Clear**ed (falls back to platform credits) with an **Undo** available before you save. Leaving a field blank keeps whatever's already stored.

Once at least one key is entered, the **Active Providers** section lets you choose, separately:

- **Text generation** — used for NPCs, monsters, items, spells, and puzzles. Without a key, this is fixed to the platform's own model, billed in credits. With a key, pick which provider handles it.
- **Image generation** — used for portraits and artwork. Shows the approximate credit cost and rendering speed for whichever provider is selected, even when you're not paying credits for it.

With any BYOK key active for a given kind of generation (text or image), that kind is billed to your own provider account — no credits are deducted for it.

### When BYOK is not available

- Free plans don't have AI generation at all, so BYOK doesn't apply — the tab shows an upgrade prompt in place of these sections, whatever the toggle is set to.
- If you downgrade from Pro, a previously stored key stays saved but stops being used — generation falls back to credits automatically.

## Other things on the AI Assistant tab

Pro only, and only once the **AI Assistant** toggle is on:

- **Campaign Setting Prompt** — free text describing your world's tone and visual style, included in every generation request so content stays consistent. A **Load … Defaults** button appears when your chosen setting has one.
- **Your AI Usage** — a running total of credits spent per generation, shown for platform-credit campaigns (BYOK calls are billed by your provider, not tracked here).
- **Chronicler Promotion** — an opt-in checkbox letting Grimoire feature your campaign's AI-generated Chronicler scene illustrations in its own gallery or marketing. Off by default; your campaign name, notes, and player data are never shared either way.

## What your players see

Nothing here — AI configuration is entirely DM-only. Players see the *results* (an NPC's portrait, a generated item) exactly like any other campaign content, with no indication of how it was paid for.

## Tips

> If image generation is greyed out with "No provider available," a BYOK image key was cleared without a platform provider configured — enter a key or ask an admin to check the platform's image provider setup.

- On Pro, turning the **AI Assistant** toggle off is the fastest way to run a fully hand-authored campaign without generation buttons cluttering every screen. On Free, you'll still see a **Generate with AI** button here and there — it opens an upgrade prompt rather than a working generator.
- Switching between Local Mode and account-encrypted storage migrates your existing key automatically the next time you save — you won't be forced to re-enter it just because you toggled the checkbox.

## Related

- [Welcome to Grimoire](#welcome-to-grimoire)
- [Campaign Settings](#campaign-settings)
- [Importing an Adventure](#importing-an-adventure)
- [Billing & Subscription](#billing-subscription)
- [Party Tracker](#party-tracker)
