---
title: Vault — Overview
section: Item Vault
section_order: 7
order: 0
summary: What the Vault is, how to build it, hand items to players, and what players see in their own inventory.
keywords: vault, item, items, overview, template, library, source, generate, clone, copy, campaign, hand out, attunement, paper doll, coin, inventory
---

The **Vault** (**Item Vault** — shown as **Items** on the mobile bottom bar — in the sidebar's Compendium group, `/vault`) is your library of item templates: mundane gear and magic items alike. Everything a character can carry, a shop can sell, or a chest can hold starts here as a template; handing one to an NPC or player creates an inventory entry that references it.

## Key ideas

| Term | Meaning |
| --- | --- |
| Vault item | The template — name, stats, art, description |
| Inventory entry | A specific carried instance of a vault item (quantity, charges, identified state, notes) |
| Scope | General (available in every campaign you run) or scoped to one active campaign |
| Shared / library item | A published item your account did not create — read-only until you clone it |
| Identification | Magic items can show players a mundane appearance/description until the DM identifies them |

## Browsing and filtering

The list filters by:

- **Search box** — matches by name.
- **Item type** — weapon, armor, shield, ring, wand, staff, scroll, potion, gear, ammunition, art object, other.
- **Rarity** — mundane through legendary.
- **Source** — narrows to one publisher/source (populated from what's actually in your Vault).
- **Show items from all campaigns** checkbox — off by default, so the list shows only general items plus items scoped to your active campaign; check it to search your whole library at once.

Click **Clear** (shown only once a filter is active) to reset everything. Filters persist across navigation within a session.

Each card shows the item's art, a quick stat line (damage / AC / charges), and up to four tags; rarity is shown as a badge. Owned rows show an **Edit** button on hover; shared/library rows show a **Reference** chip instead and are read-only until cloned.

## Choosing which sources appear

Click the **library icon** button in the toolbar to open **Item Sources**. This lists every published source your admin has seeded into Grimoire's shared item library, with a running count of how many items it holds. Check a source to make its items appear in your Vault **instantly** — nothing to download or import — and uncheck it to hide those items again. This choice is per campaign. The panel links to **Licenses & attribution** for the publishers you've enabled.

> Every published item lives once in Grimoire's shared library, toggled on per campaign — there's nothing to import or download.

## Creating an item

Click **New Item** to open a blank editor, or **Clone to customize** on a shared/library item to mint your own editable copy that shadows it.

## Generating an item with AI

Click **Generate** in the toolbar to open the Item Generator side panel:

1. **Concept** — describe the item in prose; the AI drafts the full record from it.
2. **Constraints** (optional) — pin an **Item Type** and/or **Rarity** so the result fits what you need.
3. **Generate item art** toggle — also produce a portrait.
4. **Make it cursed** toggle — let the AI choose and write a curse for the item.

The panel shows the credit cost before you confirm — it works the same on every plan, as long as the campaign's AI Assistant is on and you can afford the cost.

## Editing an item

Open any owned item and click **Edit** (or it's already in edit mode for a new item). The editor is a two-column form:

- **Portrait** — tabbed **Identified** / **Mundane** art, each with independent focal-point control. The mundane image is what players see before identification.
- **Tags** — free-form; drives automation across the app. See [Item Tags Overview](#item-tags-overview).
- **Name, Type, Subtype, Rarity**.
- **Weight** and **Cost** — cost is freeform text (e.g. "50 gp"); a rarity-based price hint appears for magic items.
- **Weapon section** (weapons only) — damage rolls, versatile damage, range, weapon properties, and (2024-ruleset campaigns only) a **Mastery** dropdown.
- **Armor section** (armor only) — Armor Class text, supports formulas like "13 + DEX modifier (max 2)".
- **Magic Properties** (non-mundane only) — **Requires Attunement** toggle with an optional "by whom" text.
- **Charges / Quantity** — relabels to **Quantity** for ammunition items. Magic items also get a **Recharge** dice expression and trigger text (e.g. "dawn"). Plus **Arcane Focus** and **Container** checkboxes — the Container checkbox is the same thing as adding the `container` tag.
- **Bundle Contents** (pack items) — a list of sub-items with quantities; adding a pack to an inventory auto-expands it into individual rows inside a container.
- **Linked Spells** (non-mundane only) — search and multi-select spells from the Spellbook, e.g. for a staff that can cast specific spells.
- **Mundane Description** (non-mundane only) — rich text shown to players before identification.
- **Description** — rich text shown after identification (or always, for mundane items).
- **Written Contents** — optional in-world text the item itself carries (a ledger's pages, a scroll's text). Folded behind a **HAS WRITING** toggle; unfolding it exposes the editor, a **PLAYER WRITABLE** checkbox letting campaign members append their own entries, and the entry thread itself.
- **DM Notes** — rich text, never shown to players.
- **Curse** (non-mundane only) — a **CURSED** toggle plus rich text description. Reveal it to players from the item's inventory detail panel once triggered.
- **Scope** — **General — all campaigns** or **Campaign — _active campaign name_**. New items default to your active campaign.
- **Source** — freeform for custom items; a read-only link for imported ones.

## Handing items to players

On an item's **view page**, the **Hand out…** menu gives you three ways to put it in front of the table:

1. **Add to Party Stash** — adds it to the shared party inventory (no specific carrier).
2. **Assign to Player** — pick a party member from the list; it lands in their backpack.
3. **Drop in Chat** — posts the item to the campaign feed as a claimable drop. If it's a magic item, only its mundane appearance and description are shown until claimed and identified.

A shared/library item is cloned into your own Vault automatically the first time you hand it out this way, so the inventory entry always points at something you own.

## Copying and re-scoping in bulk

Click **Select** to turn the grid into a selection surface (a checkbox appears on every card). With items selected, a bar above the grid offers:

- **Move** — re-scope the selection to the active campaign, or to "all campaigns" (general). This changes where the *same* row lives.
- **Copy to campaign…** — create independent duplicates of the selection in another campaign, picked from a target list that excludes every campaign a selected item already occupies. A copy is a second row you can then let diverge from the original — art, quota, and cross-references travel with it; a reference to another entity (like a linked spell) is dropped only if it would otherwise point at something the target campaign can't see, and you're told which references that affects before confirming.

The same **Copy to campaign…** action is available for a single item from its edit-mode **Send to…** menu, alongside **Scriptorium** export.

## Header actions on an existing item

- **View mode** — **Hand out…** (above), then **Edit**.
- **Edit mode** — **Send to…** (Scriptorium export, Copy to campaign…), **Clone** (a same-scope duplicate, suffixed "- Clone"), **Delete**, and **Save**.
- **Shared/library item** — only **Clone to customize** is offered; it can't be edited or deleted directly.

## What your players see

Players manage everything they carry from **Inventory** in the Player Portal:

- **The Paper Doll** — a character silhouette with eleven equip slots (Head, Neck, Shoulders, Body, Gloves, Ring, Waist, Clothes, Boots, Main Hand, Off Hand). Each slot accepts items matching its tags or type — a `helmet`/`hat`/`hood`/`crown` tag for Head, an item **Type** of Armor for Body, and so on. Clicking a filled slot opens its detail panel; clicking an empty one lists eligible items to equip. Equipping part of a stack splits off one unit automatically. The silhouette itself switches art depending on whether the Clothes slot is filled.
- **Attunement tracker** — three pip dots showing how many of the player's three attunement slots are used; hovering a filled pip names the item.
- **Coin Purse** — five currency columns (PP/GP/EP/SP/CP), each editable inline. **Drop Coins to Chat** posts a currency drop the party can see.
- **Carry Weight bar** — shows load against capacity (STR × 15, doubled for a **Powerful Build** species), with Unencumbered/Encumbered/Heavily Encumbered/Over Encumbered bands. The capacity figure is click-to-override with an absolute value, a multiplier (`*2`), or an addition (`+30`); a reset control restores the default. Items in a container tagged `extradimensional` contribute zero weight.
- **Backpack, Belt, and custom containers** — see [Containers](#containers) for how a container is created and how it affects ranged-ammo selection.
- **Stored Elsewhere** and **Party Stash** sections for items not on the character's person or not assigned to anyone.
- **Add item form** — a sticky search box at the bottom of the page adds any item from the Vault your character can see, by name and quantity.

Clicking any item row or slot opens its **detail panel**, which — once identified, for magic items — shows the stat block, a quantity stepper, a charge tracker with **Spend Charge** / **Recharge** buttons, an **Attune** / **Attuned ✓** toggle (disabled past 3 attuned items), a **Cast** button for any linked spells, a **Notes** field, the item's Written Contents thread if it has one, and a **List for Sale** form that posts an offer to chat. A DM (not in preview mode) additionally sees **Identify** / **Unidentify** and, for a cursed item, a reveal toggle controlling whether the curse text is shown to the player.

## Tips

> A magic item's mundane appearance and description are what players see until you flip it to Identified from the inventory detail panel — set both before handing it out if you want the surprise to land.

- "Show items from all campaigns" is off by default so a busy multi-campaign account doesn't drown the active campaign's list in unrelated homebrew.
- The bulk **Copy to campaign…** picker only offers campaigns the selection *isn't* already in — if you don't see a destination you expected, check whether the item is already general (visible everywhere).
- Cloning a shared item never changes the original — your clone is a new row that shadows it in your own Vault from then on.

## Related

- [Item Tags Overview](#item-tags-overview)
- [Ranged Weapons & Ammunition](#ranged-weapons-ammunition)
- [Containers](#containers)
- [Spellbook — Overview](#spellbook-overview)
- [Workshop Overview](#workshop-overview)
