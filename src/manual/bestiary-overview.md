---
title: Bestiary — Overview
section: Bestiary
section_order: 5
order: 0
summary: How the monster compendium works and where its content comes from.
keywords: bestiary, monsters, compendium, srd, open5e, import, custom, filter, source
---

The Bestiary is your monster compendium. It combines three content sources into a single searchable list:

1. **SRD bundle** — ~322 monsters from the 5.1 Systems Reference Document, built into Grimoire. No import needed, no network fetch.
2. **Open5e imported monsters** — monsters from third-party published sources you choose to import.
3. **Custom monsters** — monsters you create from scratch in the Monster Builder.

## Filtering the list

The list supports:

- **Text search** — searches name (debounced).
- **Source filter** — All / SRD / Custom (or by specific imported source).
- **Type filter** — 14 standard D&D monster types (Beast, Dragon, Undead, etc.).
- **Open5e sources** — a persistent popover lets you pick which published sources to include.

Filter state is stored in the session so it persists while you navigate.

## Monster cards

Each card shows the monster's portrait (if any), name, type, CR, and alignment. Hovering the card reveals an **Edit** button that jumps directly to the Monster Builder for that entry. SRD monsters are read-only (no Edit button); import or create a custom copy to modify them.

## Player discovery

Players don't automatically see your full bestiary. Each monster has **visibility controls**:

- **Share to whole party** — one click reveals the monster to all players.
- **Per-player visibility** — toggle which individual players know about this creature.
- **Stats visible** — separately controls whether players see the stat block or only the name and image.

Monsters are added to a player's discovered creatures list when you reveal them manually here, or automatically when the creature appears in a **Revealed** state during a live encounter.

See _Encounters: Monster Discovery_ for how the runner handles in-combat reveals.
