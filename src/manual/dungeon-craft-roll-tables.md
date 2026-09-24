---
title: Dungeon Craft — Roll Tables
section: Dungeon Craft
section_order: 9
order: 3
summary: Create random encounter and event tables, generate one with AI, and roll on them in real time.
keywords: roll table, random table, d20, d100, encounter link, roll, result, generate, ai
---

Roll tables let you codify random events — wandering monster tables, wild magic surges, random NPC quirks, weather tables — and roll on them directly in Grimoire. Find them under **Compendium → Dungeon Craft**, the **Roll Tables** tab.

## Key ideas

| Term | Meaning |
| --- | --- |
| Die | The single die this table rolls on — 1d4 through 1d100 |
| Entry range | The inclusive min–max the entry covers on that die |
| Placed In | The rooms this table has been dropped into on your Atlas sites |
| Scope | General (every campaign) or one specific campaign |

Roll Tables are fully **inline** inside the Dungeon Craft hub — there's no separate route. Clicking a table card opens an inline editor/viewer in the same tab; a **← All Tables** button in the header closes the detail back to the list.

## Creating a roll table

Click **New Roll Table**. Set:

- **Name** — required.
- **Die type** — 1d4, 1d6, 1d8, 1d10, 1d12, 1d20, or 1d100.
- **Scope** — **General — all campaigns** or a specific campaign; new tables default to your active campaign.
- **Tags**.

Then add **entries**. Each entry has:

- **Min** and **Max** — the inclusive range of die results this entry covers (e.g. min 1, max 3 on a d20 covers results 1, 2, and 3).
- **Label** — what happens on this result.
- **Linked Encounter** — optionally link an encounter from your encounter list. Clicking the rolled result opens that encounter sheet directly.
- **Notes** — DM-only notes about this result.

## Entry ranges

Ranges can be sparse — you don't need to cover every number. The editor validates ranges in real time — overlapping ranges and out-of-bounds values block saving — but sparse coverage (e.g. only rolls 1–3 on a 1d6) is intentional and allowed. A roll that falls in a gap produces a "No entry covers this result" message.

For a standard wandering monster table:

- Ranges of 1–2 might represent a minor encounter.
- 3–17 might mean no encounter.
- 18–20 might be a major encounter — each pointing to a different linked encounter.

## Rolling the table

A sticky panel on the right of the detail view has a **Roll** button. Clicking it:

1. Rolls the die (raw result shown in large text).
2. Shows the matching entry's label.
3. Shows the linked encounter link (if any) and notes.

## Editing inline

Roll tables use an inline editing interface — entries are edited directly in the table grid without navigating to a separate form. Click any cell to edit it.

## AI roll table generator

Click **Generate** to open the Roll Table Generator panel. This needs a Pro subscription and your campaign's AI generation switched on (Campaign Settings → AI Assistant) — on Free, the button opens the upgrade paywall instead:

1. Write a **Concept** — a one-line prompt (e.g. "forest road at night, bandits active in the region, levels 3–5").
2. Pick a **Die** — d6, d8, d10, d12, or d20 (the manual editor above also offers d4 and d100, but the generator's choices are limited to these five).

The AI returns a full table — name, tags, a one-line description, and entries whose ranges cover the whole die with no gaps or overlaps — grounded in your campaign's own NPCs, locations, and factions where relevant. Chips under the preview show which campaign entities it recognised; an unmatched name renders dashed and marked "new" rather than being silently dropped, though nothing is saved from those chips automatically. Click **Create Table** to save it (scoped to your active campaign); you'll need to link any encounters by hand afterward.

## Placing a table in your world

A roll table's own page has a **Placed In** panel showing every room it's dropped into across your Atlas sites, with an editable note and a picker to add a new placement. See [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for the room-side view.

## Moving a table between campaigns

From the table's own page, **Copy to campaign…** makes an independent copy elsewhere, keeping its label but dropping any **Linked Encounter** reference (encounters don't cross campaigns). From the Roll Tables tab, **Select** lets you move or copy several at once.

## Campaign scoping

Tables belonging to your active campaign, plus every General table, show together. **Populate Examples** seeds example tables into your active campaign.

## Related

- [Dungeon Craft — Overview](#dungeon-craft-overview)
- [Encounter Builder](#encounter-builder)
- [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
