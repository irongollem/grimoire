---
title: AI Generation & Credits
section: Getting Started
section_order: 0
order: 3
summary: How AI generation works, what credits are, and how BYOK differs from using platform credits.
keywords: ai, credits, byok, api key, generation, cost, billing, openai, gemini
---

## How AI generation works

Grimoire uses AI to generate NPCs, monsters, items, spells, locations, traps, factions, puzzles, quest hooks, and chronicle narratives. Every generation call goes to a large language model (OpenAI or Google Gemini depending on your campaign settings) and produces a structured result that gets saved to your campaign.

There are two ways to pay for those AI calls: **credits** or **BYOK**.

---

## Credits

Credits are Grimoire's built-in currency for AI generation. When you generate something using Grimoire's platform API key, a small number of credits is deducted from your balance.

- **Free and Tester plans** always use credits (no personal API key option).
- **Pro plan** users also use credits by default, unless they configure a personal key (see BYOK below).

You can see your current balance and purchase credit packs from the **Billing** page in the sidebar. Credit pack sizes and prices are shown there and are always up to date.

Different generators have different credit costs — a full NPC with portrait costs more than a quest hook with no image. The exact costs per generator are shown on the Billing page.

---

## BYOK (Bring Your Own Key) — Pro only

**BYOK** means "Bring Your Own Key." Pro plan users can store a personal OpenAI or Gemini API key in their campaign settings. When a personal key is configured, all AI calls for that campaign use it directly — **no credits are deducted**. Instead, the cost appears on your own API provider's bill.

To set a BYOK key: open **Campaign Settings → AI** and enter your key. It is encrypted at rest and never logged or displayed in plaintext after saving.

### When BYOK is useful

- You already pay for an API subscription and want to use your own allocation.
- You generate large volumes and want to avoid purchasing credit packs.
- You want full transparency into usage via your provider's dashboard.

### When BYOK is not available

- Free and Tester plans cannot store personal keys. All generation uses credits.
- If you downgrade from Pro to Free/Tester, your stored key remains saved but is no longer used — the platform falls back to credits.

---

## Which generators use AI?

All of the following can generate content from a text prompt:

| Generator | Text | Image |
|-----------|------|-------|
| NPCs | Yes | Yes (portrait) |
| Monsters | Yes | Yes |
| Items | Yes | Yes |
| Spells | Yes | Yes |
| Locations | Yes | Yes (scene + map) |
| Traps | Yes | Yes |
| Factions | Yes | Yes (emblem) |
| Puzzles | Yes | Yes |
| Quest Hooks | Yes | No |
| The Chronicler (narrative) | Yes | Yes (scene illustration) |

Image generation costs more than text generation. You can opt out of image generation in most generators.

---

## Summary

| | Free / Tester | Pro (no key) | Pro (BYOK key set) |
|---|---|---|---|
| Pays with | Credits | Credits | Own API bill |
| Credits deducted | Yes | Yes | No |
| Personal key required | No | No | Yes |

For current credit pack pricing and per-generator costs, see the **Billing** page in the sidebar.
