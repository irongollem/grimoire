---
title: Player Portal — Overview
section: Player Portal
section_order: 12
order: 0
summary: What players see in Grimoire and how the DM controls their experience.
keywords: player, portal, overview, visibility, share, real time, sync, character sheet, inventory, spells
---

The Player Portal is a separate, role-gated section of Grimoire available to anyone who joins your campaign as a player. Players access it automatically after accepting an invite — they cannot see DM screens.

## What players can do

The portal covers the full lifecycle of a player's session experience:

| Section         | What players do                                  |
| --------------- | ------------------------------------------------ |
| Character Sheet | View stats, HP, conditions, custom trackers      |
| Inventory       | Manage gear, paper doll, coin purse, containers  |
| Spells          | Prepare, track slots, browse class spell list    |
| Quests          | See quests you've shared, add personal notes     |
| Party           | See other characters, shared NPCs                |
| Atlas           | Browse locations you've shared, leave notes      |
| Bestiary        | View discovered creatures, use Wild Shape picker |
| Crafting        | Attempt revealed recipes                         |
| Factions        | See faction details, note memberships            |
| Puzzles         | Read shared puzzles, see revealed hints          |
| Journal         | Write personal entries, read party notes         |
| Rules           | Access DM screen, SRD, house rules, Codex        |
| Encounter       | Live combat panel during sessions                |
| Settings        | Customise preferences, nav order, audio          |

## What you control as DM

Almost nothing in the portal is visible to players by default. You explicitly share each piece of content:

- **NPCs** — set `visible_to` per NPC; control which fields (portrait, name, status, etc.) are shown.
- **Quests** — set `visible_to`; control which objectives and references players see.
- **Locations** — set `visible_to`; independently toggle description, NPC list, store inventory, and map.
- **Factions** — set `visible_to`; faction members are auto-visible to member PCs.
- **Monsters** — manually reveal per player; control whether stat block is visible.
- **Puzzles** — toggle Share; reveal hints one at a time.
- **Recipes** — reveal per player via the eye icon on each recipe.
- **Session notes** — set `player_visible_to` on individual notes.

## Real-time sync

Every shared piece of content syncs live to players via Supabase Realtime. When you reveal a hint, update an NPC's status, or drop loot to chat — players see it immediately without refreshing.

During a live encounter, players see HP changes, condition updates, monster reveals, and turn notifications in real time.

## DM Preview Mode

Access **Preview Mode** from the DM sidebar to browse the portal exactly as your players see it. Use `?memberId=<id>` in the URL to view as a specific character.
