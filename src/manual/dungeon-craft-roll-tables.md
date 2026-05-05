---
title: Dungeon Craft — Roll Tables
section: Dungeon Craft
section_order: 8
order: 3
summary: Create random encounter and event tables and roll on them in real time.
keywords: roll table, random table, d20, d100, encounter link, roll, result
---

Roll tables let you codify random events — wandering monster tables, wild magic surges, random NPC quirks, weather tables — and roll on them directly in Grimoire.

## Creating a roll table

Click **New Roll Table**. Set:

- **Name** — required.
- **Die type** — 1d4, 1d6, 1d8, 1d10, 1d12, 1d20, or 1d100.
- **Campaign scope** — whether this table is global (available to all your campaigns) or campaign-specific.

Then add **entries**. Each entry has:

- **Min** and **Max** — the inclusive range of die results this entry covers (e.g. min 1, max 3 on a d20 covers results 1, 2, and 3).
- **Label** — what happens on this result.
- **Linked Encounter** — optionally link an encounter from your encounter list. Clicking the rolled result opens that encounter sheet directly.
- **Notes** — DM-only notes about this result.

## Entry ranges

Ranges can be sparse — you don't need to cover every number. The validation system warns you about overlapping entries (two entries claiming the same number) but allows gaps. A roll that falls in a gap produces a "No match" message.

For a standard wandering monster table:

- Ranges of 1–2 might represent a minor encounter.
- 3–17 might mean no encounter.
- 18–20 might be a major encounter — each pointing to a different linked encounter.

## Rolling the table

Click the **Roll** button on the table detail view. Grimoire:

1. Rolls the die (result displayed as the raw number).
2. Shows the matching entry label.
3. Shows the linked encounter link (if any) and notes.

## Editing inline

Roll tables use an **inline editing** interface — entries are edited directly in the table grid without navigating to a separate form. Click any cell to edit it.

## Campaign scoping

Setting a table as campaign-specific means it only appears in that campaign's Dungeon Craft view. Global tables appear in all your campaigns. Use global tables for setting-agnostic systems (random weather, random NPC traits) and campaign tables for world-specific wandering monster tables.
