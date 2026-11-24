---
title: "Dungeon Craft: Roll Tables"
section: Dungeon Craft
section_order: 9
order: 3
summary: Create random encounter and event tables, generate one with AI, and roll on them in real time.
keywords: roll table, random table, library, use in campaign, d20, d100, encounter link, roll, result, generate, ai
---

Roll tables let you codify random events (wandering monster tables, wild magic surges, random NPC quirks, weather tables) and roll on them directly in Grimoire. Find them under **Compendium → Dungeon Craft**, the **Roll Tables** tab.

## Key ideas

| Term | Meaning |
| --- | --- |
| Die | The single die this table rolls on: 1d4 through 1d100 |
| Entry range | The inclusive min–max the entry covers on that die |
| Placed In | The rooms this table has been dropped into on your Atlas sites |
| Scope | General (every campaign) or one specific campaign |

Roll Tables are fully **inline** inside the Dungeon Craft hub: there's no separate route. Clicking a table card opens an inline editor/viewer in the same tab; a **← All Tables** button in the header closes the detail back to the list.

## Creating a roll table

Click **New Roll Table**. Set:

- **Name**: required.
- **Die**: 1d4, 1d6, 1d8, 1d10, 1d12, 1d20, or 1d100.
- **Description**: when and where to use this table.
- **Scope**: **General · all campaigns** or **Campaign · its name**; new tables default to your active campaign.
- **Tags**.

Then add **entries** with **Add row**. Each entry has:

- **Min** and **Max**: the inclusive range of die results this entry covers (e.g. min 1, max 3 on a d20 covers results 1, 2, and 3).
- **What happens?**: the label for this result.
- **Link encounter…**: optionally link an encounter from your encounter list. The rolled result then has an **Open encounter →** button that opens that encounter sheet directly.
- **Notes for you only**: DM-only notes about this result (click **+ add note** to start one).

## Entry ranges

Ranges can be sparse: you don't need to cover every number. The editor validates ranges in real time (overlapping ranges and out-of-bounds values block saving), but sparse coverage (e.g. only rolls 1–3 on a 1d6) is intentional and allowed. A roll that falls in a gap produces a "No entry covers this result" message.

For a standard wandering monster table:

- Ranges of 1–2 might represent a minor encounter.
- 3–17 might mean no encounter.
- 18–20 might be a major encounter, each pointing to a different linked encounter.

## Rolling the table

A sticky panel on the right of the detail view has a **Roll** button. Clicking it:

1. Rolls the die (raw result shown in large text).
2. Shows the matching entry's label.
3. Shows the linked encounter link (if any) and notes.

## Editing inline

An existing table opens to read; click **Edit** to change it. In edit mode the entries are rows you change in place, without a separate form.

## Asking the table: send a roll table to your players

A roll table is also a list of options you can put in front of your players as a question: which pet does each child take, which road does the party follow, which trinket does the giant hold out. Players answer on their own phones, so nobody needs to see your screen.

### Prepare the entries

Each entry can carry more than words:

1. In the entry row, use the "this entry is" picker to choose **Nothing**, **Creature**, **Item** or **NPC**, then search for the one you mean. Its picture appears beside the entry, and an empty label is filled with its name. A label you typed is never overwritten.
2. In the blurb box, **What the players read under the picture**, write one or two sentences the players will read. This is shown to players. The DM-only note on the entry is not.

### Send it

1. Open the roll table and click **Send to the table**. On your dashboard, the roll table card has **Ask the table** for the same thing, so you can do it mid-session without leaving the dashboard.
2. Check the **Question**, which starts as the table's name, and edit it if you like, for example "Which road do we take?".
3. Under **How do they answer?**, choose:
   - **Each picks their own**: every player chooses for their own character. Turn on **Only one of each** if no two players may take the same option. Turn on **What they pick is theirs** to give them what they choose: an item goes into their pack, and a creature or NPC joins their companions. That switch appears only when some entry names a creature, item or NPC. A gift cannot be swapped by the player, though you can take one back.
   - **The table votes**: you see the tally and decide when to close it. **Hide votes until I close it** is on by default so nobody copies the first answer.
   - **Each rolls**: every player rolls the table from their own screen and gets what it lands on.
4. Look over the options as players will see them, then click **Send to the table**. Options are copied when you send, so changing the table later does not change a question already sent. A different list is a new question.

### What your players see

The question appears first on the **Hearth** page of the player portal, as a grid of large pictures with the name and the blurb under each. A tap picks it. A gift asks once to confirm before it is taken, and then it is final. A roll is one big button. Child accounts get the same cards, two across, with nothing extra to read. A player with an open question they have not answered sees a dot on the Hearth tile.

### Watching the answers

Questions you have sent are listed under **Sent to the table** on the roll table's page, and the open ones on the dashboard card. Each one shows, for every option, who chose it and how many. You can:

- **Close** a question. For a vote you are asked which option the table goes with, or choose **No result**. The player screens then show the outcome.
- **Reopen** a closed one.
- Take back one answer, which lets that player answer again. This is also how a player rolls again, and it takes back a gift.
- Switch a vote between hidden and open while it runs.
- Delete the question and everyone's answers. Deleting does not take back anything the party was already given.

Once a question is closed, players can change nothing.

## AI roll table generator

Click **Generate** to open the Familiar on the right with a roll table card. This needs your campaign's AI generation switched on (Campaign Settings → AI Assistant) and enough credits to cover the cost. If AI is off, the card points you at the toggle.

1. Write what to make: a one-line prompt (e.g. "forest road at night, bandits active in the region, levels 3–5").
2. Pick a **Die**: d6, d8, d10, d12, or d20 (the manual editor above also offers d4 and d100, but the generator's choices are limited to these five).

The AI returns a full table (name, tags, a one-line description, and entries whose ranges cover the whole die with no gaps or overlaps), grounded in your campaign's own NPCs, locations, and factions where relevant. Chips in the preview show which campaign entities it recognised; an unmatched name renders dashed and marked "new" rather than being silently dropped, though nothing is saved from those chips automatically. Click **Create Table** to save it (scoped to your active campaign); you'll need to link any encounters by hand afterward.

## Placing a table in your world

A roll table's own page has a **Placed In** panel showing every room it's dropped into across your Atlas sites, with an editable note and a picker to add a new placement. See [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for the room-side view.

## Moving a table between campaigns

From the table's own page, **Copy to campaign…** makes an independent copy elsewhere, keeping its label but dropping any **Linked Encounter** reference (encounters don't cross campaigns). From the Roll Tables tab, **Select** lets you move or copy several at once.

## Campaign scoping

Tables belonging to your active campaign, plus every General table, show together. The library's example tables show up too once you enable a book with the **book icon** in the Dungeon Craft header: open one and click **Use in campaign** to copy it into your active campaign as your own table.

## Related

- [Dungeon Craft: Overview](#dungeon-craft-overview)
- [Encounter Builder](#encounter-builder)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
