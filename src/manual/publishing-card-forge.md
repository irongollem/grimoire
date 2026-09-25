---
title: "Card Forge: Card Printer"
section: Publishing
section_order: 14
order: 2
summary: Print physical trading-card-style cards for NPCs, monsters, items, spells, loot, and Interlude activities.
keywords: card forge, card, print, mtg, tarot, npc, monster, item, spell, duplex, library, inked, modern, loot deck, deck back
---

**Card Forge** generates print-ready sheets of cards for your campaign entities. Find it in the sidebar under **Compendium → Publish → Card Forge** (route `/forge`; desktop only).

## Key ideas

| Term | Meaning |
| --- | --- |
| **Collection mode** | The default: mix and match cards from any source (NPCs, monsters, items, spells, and Interlude activities) into one deck. |
| **Loot Deck mode** | A dedicated items-only deck: full info on the front, one shared back for every card. |
| **Style** | **Inked** or **Modern**: two complete visual designs for every card type. |
| **Deck back** | A single shared card-back design, used in Loot Deck mode and for Interlude cards, chosen from a small picker. |

## Choosing a mode, size, and style

Three segmented controls at the top of the view govern the whole deck:

- **Collection / Loot Deck**: Collection lets you pull from any source and mixes card types freely; Loot Deck restricts you to items only, printed with a shared back instead of per-card art on the reverse.
- **Trading card (63×88mm) / Tarot (70×120mm)**: MTG-sized cards print 3×3 (9) per A4 sheet; Tarot-sized print 2×2 (4).
- **Inked / Modern**: two full styles for every card type. Switch any time; your selection carries over.

## Picking entities

In **Collection** mode, five source tabs sit in the left panel:

- **NPCs**, **Monsters**, **Items**, **Spells**: each searchable, with a badge showing how many are selected.
- **Interlude**: the downtime activity cards and prepped card backs from [The Interlude](#the-interlude-downtime).

Click an entity's checkbox to select it. **All** / **None** apply to the currently filtered (searched) list. Selections across all five sources combine into a single deck: mix an NPC, three monsters, and a handful of items freely.

In **Loot Deck** mode, the panel narrows to items only, and shows your selected count instead of per-tab tabs.

## Deck back

When you're in Loot Deck mode, or have the Interlude source selected, a **Deck Back** button appears in the toolbar. Click it to open a picker and choose the single shared back design printed on every card in that deck.

## Card anatomy

Every card has a front and back component, styled consistently in your chosen style (Inked or Modern):

**NPC / Monster (front):** title bar with name + CR or level, focal-point cropped art, type line, HP/AC/Speed stats strip, ability score grid, footer with tags.
**NPC / Monster (back):** full stat block (skills, saves, resistances, senses, languages, challenge), traits/actions/legendary actions, flavor footer.
**Item (front):** title + rarity badge, art, type line, damage/AC/charges stats, info grid (weight, value, attunement, tags), footer.
**Item (back):** extended description, properties, flavor text.
**Spell (front):** title + level badge, art, school/casting-time line, Range/Duration/Components, truncated description, class-tag footer.
**Spell (back):** full description, property list, higher-level effects.

**Tarot** variants of every type use the taller format with adjusted layouts.

## Printing

Click **Print**: the button shows your selected card count, e.g. **Print (12)**. The sheet prints fronts first, then backs, with:

- **1mm bleed** on every card for accurate cutting.
- **Duplex alignment**: the back sheet reverses card columns per row, so flipping the paper on the long (left) edge lines every back up with its front.

## Card Library (saved collections)

- **Save Collection** stores your current selection (and mode) under a name, to browser `localStorage`: nothing leaves your device.
- **Load Collection** restores a saved selection instantly, including which source tab had the most cards.
- Saved collections can be deleted individually from the load dialog.

## Tips

> Card Library is stored in your browser only. It won't follow you to another device or survive clearing site data.

- **Frame colours are automatic**, keyed to entity type, not something you configure per card.
- **A card's art is whatever portrait the entity already has.** Add or change art on the NPC/Monster/Item/Spell itself; Card Forge doesn't have its own art uploader.

## Related

- [The Interlude: Downtime](#the-interlude-downtime): the source of the Interlude card type.
- [The Mint: Tokens and Coins](#the-mint-tokens-and-coins): for round VTT tokens instead of trading cards.
