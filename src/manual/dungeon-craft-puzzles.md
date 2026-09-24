---
title: Dungeon Craft — Puzzles
section: Dungeon Craft
section_order: 9
order: 2
summary: Build rich puzzles with hints you reveal live to specific players during the session.
keywords: puzzle, hint, share, reveal, player, skill check, solution, read-aloud, realtime, who, scope
---

Puzzles in Grimoire are more than notes — they're interactive experiences your players can engage with directly through the Player Portal. You write the puzzle; you reveal hints one by one during play; the players you've named read everything you've exposed in real time. Find them under **Compendium → Dungeon Craft**, the **Enigmarium** tab.

## Key ideas

| Term | Meaning |
| --- | --- |
| Reveal | Who can currently see this puzzle — a specific set of party members, or nobody |
| Hint ladder | The ordered hints; you reveal them one at a time as the audience |
| Location / Dungeon Feature | Where the puzzle physically sits — a room and/or the feature that conceals it |
| Scope | General (every campaign) or one specific campaign |

## Browsing and filtering

The Enigmarium tab has a search box plus type and difficulty filters, all of which persist as you navigate into a puzzle and back. A **Clear** button appears once a filter is active. The list shows general puzzles plus your active campaign's own.

## Puzzle types and difficulty

Types: Logic, Physical, Arcane, Social, Environmental. Difficulties: Trivial, Easy, Medium, Hard, Deadly. Both are colour-coded on the card thumbnail.

## Creating a puzzle

Click **New Puzzle**. The editor has several sections:

**Identity:**

- **Name** — required.
- **Type** and **Difficulty** — from the lists above.
- **Location** — an Atlas location this puzzle is anchored to, if any.
- **Dungeon Feature** — a Dungeon Feature (e.g. the Secret Door concealing it) this puzzle is anchored to, if any.
- **Tags** — freeform labels.
- **Image** — a square image representing the puzzle (focal-point aware).
- **Scope** — **General — all campaigns** or a specific campaign; new puzzles default to your active campaign.

**Setup:**

- **Setup** — rich text describing what the players observe when they encounter the puzzle. This is the sensory/environmental description, not the solution.

**Skill Checks:**

- A list of skill + DC pairs. Add as many as the puzzle requires. These are visible to players as soon as you reveal the puzzle to them, giving them a clear sense of what they might try.

**Hints:**

- An ordered list of rich text hints. Drag-to-reorder them. Each hint is independently revealed to players (or kept hidden).

**Solution:**

- Rich text. **DM-eyes only.** This section is collapsible in the editor and never visible to players.

**Outcomes:**

- **Success** — rich text describing what happens when players solve the puzzle.
- **Failure / Consequence** — rich text for what happens if they fail or give up.

**DM Notes:**

- Private notes, variant ideas, pacing advice.

When a Location or Dungeon Feature is set, the puzzle's header shows a pill linking straight to it.

## AI puzzle generator

Click **Generate** and describe a puzzle concept. This needs your campaign's AI generation switched on (Campaign Settings → AI Assistant) and enough credits to cover the cost — if AI is off, the panel points you at the toggle instead of the form. Optionally constrain type and difficulty, and toggle an illustration if a key is configured. Grimoire produces the full puzzle including setup, hints, and solution.

## Revealing a puzzle to players

Puzzles use Grimoire's one **Reveal** control — the same icon-and-label button used across the app. On the puzzle's page it reads **Hidden**, **N players**, or **Whole party** depending on who can currently see it. Click it to open the reveal popover (a bottom sheet on phones):

1. **Who** — check the party members who should see this puzzle. This also sets the puzzle's campaign Scope to your active campaign the first time you reveal it (unless you already scoped it yourself), and un-hiding never changes a Scope you set by hand.
2. **What** — under **HINTS GIVEN**, check off each hint as you reveal it at the table.

Unchecking every party member hides the puzzle again and **clears every revealed hint** — the next group to meet it starts from the top.

**Read-Aloud** is separate from the Reveal control: it's a plain text box in the puzzle's own page, saved automatically as you type. Write your boxed text there ahead of time.

## What your players see

On the Player Portal (`/play/puzzles`), players who are in the reveal list see:

- A grid of every puzzle revealed to them, with name, type, difficulty, and hint count.
- Detail view: type, difficulty, skill checks, the **Read-Aloud** block (if you've written one, shown highlighted and separate from your own Setup text), and whichever hints you've checked off, numbered in your order.
- Solution, Outcomes, and DM Notes are never sent to players.
- "No hints revealed yet" if you haven't checked any off.

Hint reveals and Read-Aloud changes sync in real time — players see updates instantly without refreshing.

## Using puzzles during play

A workflow that works well:

1. Create and detail the puzzle ahead of session, anchoring it to a Location or Dungeon Feature if it belongs somewhere specific.
2. At the table, open the Reveal control and check the players present when the party reaches it.
3. Post the Read-Aloud text and read it out.
4. Check off hints as the party spends actions investigating — skill checks, time, or clever roleplay.
5. Once solved or abandoned, uncheck everyone to clear it from the portal and reset the hint ladder for next time.

## Moving a puzzle between campaigns

From the puzzle's own page, **Copy to campaign…** makes an independent copy in another campaign you DM, clearing its Location, Dungeon Feature, and reveal list since those don't carry across campaigns. From the Enigmarium tab, **Select** lets you move or copy several at once.

## Tips

> Puzzles are the one Dungeon Craft entity with a free-plan quota (see [Billing & Subscription](#billing-subscription)). If a copy or move hits your limit, Grimoire shows the upgrade prompt rather than failing silently.

## Related

- [Dungeon Craft — Overview](#dungeon-craft-overview)
- [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Player Portal — Overview](#player-portal-overview)
- [Billing & Subscription](#billing-subscription)
