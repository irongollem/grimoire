---
title: Dungeon Craft — Loot Tables
section: Dungeon Craft
section_order: 8
order: 4
summary: Build drop tables for items and currency, generate a hoard with AI, roll for loot, and drop it directly to chat.
keywords: loot table, loot, drop, chest, currency, item, rarity, random, roll, chat, claim, AI, generate, hoard
---

Loot tables let you define what monsters drop and distribute the results directly to players via the campaign chat.

## Creating a loot table

Click **New Loot Table**. Set:

- **Name** — required.
- **CR Tier** — Any, CR 0–4, CR 5–10, CR 11–16, or CR 17+. Used for organisation and filtering; it doesn't affect the roll logic, but the AI generator uses it to decide which item rarities to draw from.
- **Monster links** — link specific monsters from the bestiary. Linked tables appear in a "Loot Table" section on the monster's sheet.

## Entry types

Each loot table can mix any number of entries of three types:

### Specific Item

A named vault item with:

- **Item** — pick from your item vault.
- **Quantity** — a fixed number or a dice expression (e.g. `1d4`).
- **Drop Chance** — 1–100%. Each roll evaluates this entry independently.

### Currency

A fixed coin amount with:

- **Denomination** — each of the five coin types (PP/GP/EP/SP/CP) has its own field.
- **Drop Chance** — 1–100%.
- **Label** — optional, e.g. "Coin purse" or "Hidden cache".

### Random Item

A rarity-filtered random pick:

- **Rarity** — Common, Uncommon, Rare, Very Rare, or Legendary. Grimoire picks a random item of this rarity from your vault.
- **Item Type filter** — optionally restrict to a specific type (weapon, potion, ring, etc.).
- **Quantity** — fixed or dice expression.
- **Drop Chance** — 1–100%.

## AI loot generator

Click **Generate** on the Loot Tables tab, describe the hoard ("the smugglers' vault beneath the Rusty Anchor"), pick a **Tier**, and optionally tick **Skip items that require attunement**.

What makes this different from a generic AI table: Grimoire searches **your own Item Vault** — your homebrew items plus the library items your campaign's enabled sources make visible — and offers the AI only items that actually exist and fit the tier you picked. The hoard comes back built from real items, not invented names, so every entry drops something the party can actually pick up.

The preview shows each entry with its drop chance. Entries the AI named but Grimoire couldn't match to a real item are listed struck through with the reason — they're left out of the created table rather than saved as broken entries. Add those items to your Vault (or enable the source they come from) and regenerate to include them.

Click **Create Table** to save. The table is tagged as AI-generated, and any library item it references is copied into your Vault automatically, exactly as if you'd picked it by hand.

Loot generation needs the server, so it isn't available in local-key mode — searching your Vault is something only Grimoire's backend can do.

## Live roll panel

Click **Roll** on the table detail view to evaluate the table:

1. Each entry independently rolls against its drop chance.
2. The result list shows every dropped item with quantity and, for currency, the coin breakdown.
3. "N× Item Name" format for stacked quantities.
4. **Expected hit rate** (%) is shown for each entry — useful for calibrating tables.

Click **Roll** again to reroll — results are always fresh.

## Dropping a chest to chat

The **Drop to Chat** button opens a modal that walks through distributing loot to players:

1. **Re-roll preview** — see what dropped this time.
2. **Claims** — set how many players can claim from this chest (fixed number or a dice expression like `1d3`).
3. **Chest art** — optionally upload or paste a chest image.
4. **Preview** — lists each claimable atom (one item per claim slot).
5. **Effective claim count** — the lesser of rolled claims and total available items.
6. Click **Drop Chest** — posts a claimable chest message to the campaign chat.

Players claim items one at a time from the chat. Once all claims are taken, the chest is empty.

## Validation

Grimoire blocks saving a loot table if any entry has:

- An Item-type entry with no item selected.
- A Random-type entry with no rarity selected.
- A drop chance outside 1–100%.

Fix the highlighted entries before saving.
