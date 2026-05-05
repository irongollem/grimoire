---
title: Card Forge — Card Printer
section: Publishing Tools
section_order: 11
order: 1
summary: Print physical trading-card-style cards for NPCs, monsters, items, and spells.
keywords: card forge, card, print, mtg, tarot, npc, monster, item, spell, duplex, library
---

**Card Forge** (`/forge`) generates print-ready sheets of cards for your campaign entities — in either Magic: The Gathering size (63×88mm) or Tarot size (70×120mm).

## Card sizes

| Format | Dimensions | Per sheet |
|---|---|---|
| MTG | 63×88mm | 3×3 = 9 cards |
| Tarot | 70×120mm | 2×2 = 4 cards |

## Entity sources

Select entities from four tabs — NPC, Monster, Item, Spell. Each tab has a search bar and entity list. Click entities to select them; a badge on the tab shows how many are selected. **Select All** and **Select None** buttons apply to the current filtered list.

## Card anatomy

**NPC and Monster cards (front):**
- Title bar — name and CR or level
- Art — focal-point cropped portrait
- Type line — species/type and alignment
- Stats strip — HP, AC, Speed
- Ability score grid
- Footer — tags and entity kind

**NPC and Monster cards (back):**
- Full stat block text
- Trait, action, and legendary action entries
- Flavour footer

**Item cards (front):**
- Title and rarity badge
- Art
- Type line
- Stats — damage/AC/charges where applicable
- Info grid
- Footer

**Item cards (back):**
- Extended description
- Properties list
- Flavour text

**Spell cards (front):**
- Title and level
- Art
- Type line — school, ritual, concentration markers
- Range / Duration / Components
- Truncated description
- Footer

**Spell cards (back):**
- Full description
- Property list
- Higher-level text

**Tarot variants** — all four entity types in the taller 70×120mm format with adjusted layouts.

## Printing

Click **Print** to open the print dialog. The sheet renders with:

- 1mm bleed on all edges for accurate cutting.
- Duplex alignment — the back sheet reverses card columns per row so long-edge flipping produces correct front/back alignment.

Print fronts first, flip, print backs. Cut with a guillotine cutter for best results.

## Card Library

Save named card collections to your **Card Library** (stored in browser localStorage). Each collection remembers which entities were selected and their counts. Load a saved collection to restore your selection instantly.

## Frame colours

Each entity type has a distinct frame colour (`--fc` CSS custom property) that sets the card border and header background. These aren't user-configurable — they're set by entity type.
