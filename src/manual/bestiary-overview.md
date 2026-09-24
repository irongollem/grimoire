---
title: Bestiary — Overview
section: Encounters & Bestiary
section_order: 5
order: 0
summary: How the monster compendium works, what's in it, and how to control what players know about a creature.
keywords: bestiary, monsters, compendium, srd, library, open5e, custom, filter, source, scope, reveal, visibility
---

The Bestiary is your monster compendium — every stat block available to your campaign, from the built-in SRD library to content from other published sourcebooks to monsters you've written yourself. It's also where you decide which creatures your players have actually met, separately from what exists in your notes. Find it at **Compendium → Bestiary** in the sidebar (`/monsters`).

## Key ideas

| Term | Meaning |
| --- | --- |
| **SRD monsters** | ~322 creatures from the 5.1 Systems Reference Document, built into Grimoire. Always available, read-only. |
| **Library monsters** | Monsters from other published sourcebooks (Kobold Press, EN Publishing, and more) that Grimoire already has seeded. You choose which sourcebooks are visible per campaign — nothing to import or download. |
| **Custom monsters** | Monsters you create yourself in the Monster Builder. |
| **Scope** | Whether a custom monster is visible in every campaign you run ("General") or only the one it's scoped to ("Campaign"). Set per monster on its own page. |
| **Reveal** | Whether a player's Bestiary tab shows a creature at all, and whether it shows the full stat block or just a name and picture. |

## Browsing and filtering

The bestiary list combines all three sources into one searchable grid.

1. Type in the search box to filter by name.
2. Use the **source filter** dropdown to narrow the list to **All sources**, **Custom**, or one specific enabled sourcebook.
3. Use the **type filter** dropdown to narrow by creature type (Beast, Dragon, Undead, and the rest of the 14 standard D&D types).
4. Switching your active campaign changes what you see: the SRD and enabled library monsters, plus your own custom monsters that are either General or scoped to that campaign.

## Choosing which sourcebooks appear

Click the sources icon (tooltip **Manage monster sources for this campaign**) to open **Monster Sources**. Tick or untick a sourcebook to add or remove it from this campaign's Bestiary — "Enabled sources appear in your Bestiary instantly — no download needed." There's nothing to sync or import; the content already lives in Grimoire, and this control only decides what you can see. If the list is empty, ask an admin to seed the library.

> The sources you enable here also decide what the AI Encounter Generator and the encounter builder's name-matching can suggest — see [Encounter Builder](#encounter-builder).

## Sharing a monster with your players

Every monster card, and the monster's own page, carries a reveal control (the button shows the current state — **Hidden**, a count like "2 players", or **Whole party**):

1. Click it to open the sharing popover.
2. Under **VISIBLE TO**, pick **Whole party** to share with everyone, or tick individual players under **OR SPECIFIC**.
3. Under **THEY ALSO SEE**, toggle **Full stat block** if you want players to see AC/HP/abilities/traits rather than just the name and picture.
4. Click **Hide from all players** to revoke a share entirely.

This is the manual, outside-combat way to reveal a monster. During a live encounter, cycling a combatant's reveal state does the same thing automatically — see [Monster Discovery](#monster-discovery).

## Selecting and copying multiple monsters

Click **Select** (desktop) or **Select monsters** (mobile overflow menu) to enter multi-select mode, then use the bulk action bar to copy the selected monsters into another campaign you DM. To duplicate or copy a single monster, open it and use the actions on its own page — see [Creating Custom Monsters](#creating-custom-monsters).

## What your players see

Players never see your full Bestiary. Their **Bestiary tab** in the Player Portal shows only monsters you've revealed to them, with or without stats depending on what you chose above. See [Monster Discovery](#monster-discovery) for how a live encounter adds to it automatically, and [Creating Custom Monsters](#creating-custom-monsters) for what a discovered monster's entry offers a player.

## Tips

> If a monster you expect to see is missing, check both the **source filter** and whether its sourcebook is still enabled under Monster Sources — a disabled source disappears from the list entirely, not just from search.

- Shared monsters — SRD or library — have no Edit button; you can't modify them directly. Create a custom monster, or duplicate a shared entry from its own page, to make your own version.
- A monster's scope only changes who can *find* it going forward. If you later re-scope a monster to a different campaign, encounters, quests, and loot tables that already reference it keep working — it just drops out of pickers for campaigns it's no longer scoped to.

## Related

- [Creating Custom Monsters](#creating-custom-monsters)
- [Monster Discovery](#monster-discovery)
- [Encounter Builder](#encounter-builder)
- [NPC Tracker — Overview](#npc-tracker-overview)
