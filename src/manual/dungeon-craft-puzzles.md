---
title: Dungeon Craft — Puzzles
section: Dungeon Craft
section_order: 8
order: 2
summary: Build rich puzzles with hints you reveal live to players during the session.
keywords: puzzle, hint, share, reveal, player, skill check, solution, read-aloud, realtime
---

Puzzles in Grimoire are more than notes — they're interactive experiences your players can engage with directly through the Player Portal. You write the puzzle; you reveal hints one by one during play; players read everything you've exposed in real time.

## Creating a puzzle

Click **New Puzzle**. The editor has several sections:

**Identity:**

- **Name** — required.
- **Type** — Logic, Physical, Arcane, Social, or Environmental.
- **Difficulty** — Trivial, Easy, Medium, Hard, or Deadly.
- **Tags** — freeform labels.
- **Image** — a square image representing the puzzle (focal-point aware).

**Setup:**

- **Setup** — rich text describing what the players observe when they encounter the puzzle. This is the sensory/environmental description, not the solution.

**Skill Checks:**

- A list of skill + DC pairs. Add as many as the puzzle requires. These are visible to players as soon as you share the puzzle, giving them a clear sense of what they might try.

**Hints:**

- An ordered list of rich text hints. Drag-to-reorder them. Each hint is independently revealed to players (or kept hidden).

**Solution:**

- Rich text. **DM-eyes only.** This section is collapsible in the editor and never visible to players.

**Outcomes:**

- **Success** — rich text describing what happens when players solve the puzzle.
- **Failure / Consequence** — rich text for what happens if they fail or give up.

**DM Notes:**

- Private notes, variant ideas, pacing advice.

## AI puzzle generator

Click **Generate** (requires OpenAI API key) and describe a puzzle concept. Optionally constrain type, difficulty, and whether Grimoire should generate an illustration. Grimoire produces the full puzzle including setup, hints, and solution.

## Sharing puzzles with players

Puzzles are hidden from players by default. The **Player Share** panel (in the editor or on the detail view) controls what players see:

1. Toggle **Share** on to make the puzzle visible in the Player Portal (`/play/puzzles`).
2. Write the **Read-Aloud** text — this appears in a highlighted block in the player view, separate from the mechanical Setup. Use this for boxed text you'd read aloud at the table.
3. Reveal individual **Hints** by clicking the eye icon next to each one. Players instantly see newly revealed hints.

The summary in the share panel tells you: "Revealed hints: 2 / 5".

Turning sharing **off** clears all revealed hints automatically — the puzzle resets to a blank slate if you re-share it.

## Player experience

On the Player Portal, players see:

- A grid of all shared puzzles with name, type, difficulty, and hint count.
- Detail view: type, difficulty, skill checks, Read-Aloud block (if set), Setup text, and any revealed hints.
- A "No hints revealed yet" message if you haven't revealed any.

Hint reveals and read-aloud changes sync in **real time** via Supabase Realtime — players see updates instantly without refreshing.

## Using puzzles during play

A workflow that works well:

1. Create and detail the puzzle ahead of session.
2. At the table, share it (toggle Share on) when the party reaches it.
3. Post the Read-Aloud text and read it out.
4. Reveal hints as the party spends actions investigating — skill checks, time, or clever roleplay.
5. Once solved or abandoned, toggle Share off to clear it from the portal.
