---
title: Dungeon Craft: Loot Tables
section: Dungeon Craft
section_order: 9
order: 4
summary: Build drop tables for items and currency, generate a hoard with AI, roll for loot, and drop it directly to chat.
keywords: loot table, loot tables, hoard, treasure, loot, drop, chest, currency, item, rarity, random, roll, chat, claim, AI, generate, hoard, monster
---

Use loot tables to decide what a hoard or a monster drops, roll it, and hand the result to players through campaign chat. Find them under **Compendium → Dungeon Craft**, the **Loot Tables** tab.

## Key ideas

| Term | Meaning |
| --- | --- |
| CR Tier | An organisational/AI-constraint band: doesn't affect roll odds directly |
| Linked Monsters | Monsters whose sheet shows this table as their loot |
| Placed In | The rooms this table has been dropped into on your Atlas sites |
| Scope | General (every campaign) or one specific campaign |

## Creating a loot table

Click **New Loot Table**. Set:

- **Name**: required.
- **CR Tier**: Any, CR 0–4, CR 5–10, CR 11–16, or CR 17+. Used for organisation and filtering; it doesn't affect the roll logic, but the AI generator uses it to decide which item rarities to draw from.
- **Scope**: **General · all campaigns** or **Campaign · its name**; new tables default to your active campaign.
- **Linked Monsters**: link specific monsters from the bestiary via the **Link a monster…** picker. Linked tables appear in a "Loot Table" section on the monster's own sheet, and the monster shows here in reverse.

## Entry types

Each loot table can mix any number of entries of three types. Pick the type with the **Item** / **Currency** / **Random** buttons on a new entry:

### Specific Item

A named vault item with:

- **Item**: pick from your item vault ("Pick an item from the Vault…").
- **Quantity**: a fixed number or a dice expression (e.g. `1d4`).
- **Drop chance**: 1–100%. Each roll evaluates this entry independently.

### Currency

A fixed coin amount with:

- **Coins**: one field per coin of your campaign's currency (the D&D coins unless you changed them in Canon, under *How the world works*).
- **Drop chance**: 1–100%.
- **Label**: optional, e.g. "Belt pouch" or "Hidden cache".

### Random Item

A rarity-filtered random pick:

- **Rarity**: Common, Uncommon, Rare, Very Rare, or Legendary. Grimoire picks a random item of this rarity from your vault.
- **Type** filter: optionally restrict to a specific item type (weapon, potion, ring, etc.). The editor shows a live "N matching items in vault" count as you set filters.
- **Quantity**: fixed or dice expression.
- **Drop chance**: 1–100%.

## AI loot generator

Click **Generate** on the Loot Tables tab. This needs your campaign's AI generation switched on (Campaign Settings → AI Assistant) and enough credits to cover the cost. If AI is off, the panel points you at the toggle instead of the form. Describe the hoard ("the smugglers' vault beneath the Rusty Anchor"), pick a tier, and optionally tick **Skip items that require attunement**.

What makes this different from a generic AI table: Grimoire searches **your own Item Vault** (your homebrew items plus the library items your campaign's enabled sources make visible) and offers the AI only items that actually exist and fit the tier you picked. The hoard comes back built from real items, not invented names, so every entry drops something the party can actually pick up.

The preview shows each entry with its drop chance. Entries the AI named but Grimoire couldn't match to a real item are listed struck through with the reason: they're left out of the created table rather than saved as broken entries. Add those items to your Vault (or enable the source they come from) and regenerate to include them.

Click **Create Table** to save. The table is tagged as AI-generated, and any library item it references is copied into your Vault automatically, exactly as if you'd picked it by hand.

Searching your Vault for real items to build the hoard from isn't something a browser-only key can do, so loot generation is unavailable if your campaign's AI key is set to **Store keys locally on this device only** (**Campaign Settings → AI Assistant**).

## Live roll panel

Click **Roll** on the table detail view to evaluate the table:

1. Each entry independently rolls against its drop chance.
2. The result list shows every dropped item with quantity and, for currency, the coin breakdown.
3. "N× Item Name" format for stacked quantities.
4. Each entry shows its expected hit rate as a percentage: useful for calibrating tables.

Click **Roll** again to reroll: results are always fresh.

## Dropping a chest to chat

The **Drop chest in chat** button (beside the roll results) opens a window that walks through distributing loot to players:

1. **↻ re-roll preview** shows what dropped this time and lets you roll again.
2. **Claims (dice or fixed)**: set how many players can claim from this chest (a number or a dice expression like `1d3`).
3. **Chest art (optional)**: upload a chest image.
4. The preview lists each claimable item or coin pouch, one per claim slot. The number of claims is the lesser of what you rolled and what actually dropped.
5. Click the **Drop chest** button (it shows the number of claims) to post a claimable chest to the campaign chat.

Players claim items one at a time from the chat. Once all claims are taken, the chest is empty.

## Placing a table in your world

A loot table's own page has a **Placed In** panel showing every room it's dropped into across your Atlas sites, with an editable note and a picker to add a new placement. See [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for the room-side view.

## Moving a table between campaigns

From the table's own page, **Copy to campaign…** makes an independent copy elsewhere: an item entry whose item the target campaign can't see is dropped from the copy. From the Loot Tables tab, **Select** lets you move or copy several at once.

## Validation

Grimoire blocks saving a loot table if any entry has:

- An Item-type entry with no item selected.
- A Random-type entry with no rarity selected.
- A drop chance outside 1–100%.

Fix the highlighted entries before saving.

## Related

- [Dungeon Craft: Overview](#dungeon-craft-overview)
- [Vault: Overview](#vault-overview)
- [Campaign Chat](#campaign-chat)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
