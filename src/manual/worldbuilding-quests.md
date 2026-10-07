---
title: Quest Log
section: Quests
section_order: 3
order: 0
summary: The list of every quest in your campaign: finding, filtering and creating one, and the fields that describe it as a whole.
keywords: quest, quests, quest log, kanban, list, objectives, consequences, premise, backfill, generator, board lane, sub-quest
---

A quest in Grimoire is not a checklist: it's a small story flow you build once and then run at the table, made of **beats** (things that happen) and **objectives** (what the party is trying to achieve). This page covers the quest list, creating a quest, and the fields that describe a quest as a whole. Find it under **Campaign → Quests** in the sidebar (`/quests`).

The next two pages in this section go deeper: [Quest Story Flow](#quest-story-flow-beats-routes-objectives) explains beats, routes and objectives with a worked example, and [Running a Quest at the Table](#running-a-quest-at-the-table) covers the live session cockpit.

## Key ideas

| Term | What it means |
| --- | --- |
| Beat | A single scene or event in the quest's story: the thing that happened. |
| Objective | What the party is trying to achieve: raised, revealed, completed or failed by beats. |
| Route | A connection from one beat to another; can require one or more objectives to be in particular states before it opens. |
| Thread | A live marker tracking where the party currently stands in the story. A quest starts with one ("Main") and can run several at once. |
| Clock | A named progress clock with 2 to 12 segments, ticked by you at the table or by a rule. A full clock fires the rules watching it. |
| Payoff | What a beat gives: consequences (things that fire automatically) and loot (things you hand over). |
| Run cockpit | The live-session screen that walks a thread through the story flow, beat by beat. |

## Finding a quest

The quest list has two views, toggled from the filter bar: **Kanban** (drag cards between three columns: **Active**, **Undiscovered: waiting to be unlocked**, and **Settled**, the last covering both Completed and Failed) and **List** (a compact grid, better with many quests). Your choice persists for the session.

Filter the list with:

- **Search quests…**: matches title and premise.
- **Shared with party (N)**: only quests visible to at least one player.
- The **NPC, faction, or location…** combobox: only quests referencing that entity.
- **Prep gaps (N)**: only quests with a beat missing required material.
- **Loot pending (N)**: only quests with loot prepared but not yet handed over.

When at least one quest has a beat with a live thread standing on it, a **featured card** appears above the columns showing that quest's premise, a beats-visited / threads-live count, one progress spine per live thread, and **Resume run**.

## Creating a quest

Click **New Quest** to open the full-page quest editor. Choose how you want to start it, from the segmented control at the top (**Paste a page** and **Design it** only appear when AI is switched on for the campaign):

- **Type it**: fill in **Quest title** (required), a **Starting lane**, and an optional **Premise**, then **Create quest**. The quest is created with one beat, "The rumor," and you land on its Overview tab.
- **Paste a page**: copy a page from an adventure book into the box. Grimoire reads it, proposes a title and premise for the quest (with its story beats and routes already wired from the page's prose, and each beat's **Rumor copy** and **Reveal copy** written for you to check before you share it), and, if the page mentions other things worth keeping, offers to link, create, or ignore any NPCs, locations, or monsters it found, the same review each entity kind gets in Document Import. If your campaign already has a same-titled quest, you're warned before you create a duplicate.
- **Design it**: a back-and-forth conversation with the AI that proposes a full beat tree from your description. See [Quest Designer (AI)](#quest-designer-ai).

There's a fourth way that doesn't require opening New Quest: click **Generate** on the quest list to open the **Quest Generator** drawer (needs the campaign's AI Assistant switched on). Fill in the party level (read from your party), an optional **Quest Giver**, **Location**, and a free-text **Theme**, then **Generate Quest Hooks**: the button shows its credit cost before you confirm. Grimoire proposes exactly five hooks, each with a premise, suggested objectives, and a preview of its story beats and how they connect. Click **Create Quest** on any hook to land it in your campaign with its beats, routes, and objectives already wired; **View Quest →** and **Build flow →** open it once created.

## The quest overview

Every quest's **Overview** tab holds its identity, separate from the story that lives in its beats:

- **Title** and **Premise**: the premise is the one-or-two-sentence blurb players see; it autosaves as you type, capped to a length that keeps it one line (no DM secrets: it's rendered to players as-is).
- **Board lane**: the same status the kanban board uses (Undiscovered, Active, Completed, Failed).
- **Player sharing**: controls who can see the quest at all; nothing below is visible to a player until this is set.
- **Quest giver** and **Primary location**: links to an NPC and a location.
- **Part of quest**: makes this a sub-quest of another one, with no depth limit.
- **Opens at**: the beat the story begins at when a DM starts a run; Grimoire sets this automatically to the first beat you write, and you can override it once you have more than one.
- **Tags**: freeform labels for filtering.

If the quest has no beats yet, the Overview shows **Write the opening beat** instead of the fields above the fold; click it to jump straight into Story Flow. Once beats exist, an **Opens at** block lists where the story begins, with quick links into Story Flow.

## Objectives

The Overview's **Objectives** list is the one place every goal in the quest is tracked. Type into **Add objective…** and press Enter (or click the **+**) to add one. Each row has:

- A status mark you click to cycle it: **Open → Completed → Failed → Open** (failure sits after completion on purpose, since it's the rarer, more destructive click). An objective starts life as **Open** unless something set it dormant first: a dormant ("not yet raised") objective can only be raised by a beat or a quest-wide rule; you can't click one back into dormant by hand.
- A reveal/hide toggle: hidden objectives are invisible to players even if the whole quest is shared; a dormant objective can't be revealed until it's raised.
- A **Set due date** link (see below).
- A remove (✕) button.

When every objective is Completed or Failed, a prompt appears above the list: **Every objective is resolved.** with **Mark completed**, **Mark failed** and **Keep running**. Grimoire never closes a quest by itself, so this is how you settle it.

**Due dates.** **Set due date** gives an objective a deadline in your campaign's calendar (year, month and day, using your calendar's own month names). When the campaign's date moves forward past that day, an objective that is still Open fails on its own, under the reason "Deadline passed", and the rules watching it fire. The day itself is inclusive: an objective due on the 14th fails when the date becomes the 15th. It only applies to Open objectives of an Active quest, so a Completed objective, a Not yet raised one or a quest still Undiscovered is left alone. Winding the calendar back undoes nothing; change the status by hand if you need to. **Clear due date** (the small x) removes it.

## Clocks

The **Clocks** section holds named progress clocks for the quest: "The ritual completes", "Suspicion", "Reinforcements arrive". Type a name into **Add clock…**, choose how many **Segments** (2 to 12) and add it. You can rename a clock or change its segments later. A clock starts empty and never ticks by itself; you tick it from the Run cockpit's Clocks card, or a payoff rule ticks it (action **Tick clock**, a positive or negative number of segments). When a clock fills, every rule set to **When a clock fills…** for it fires. Clocks are for things that advance by events at the table; for something that depends on the calendar, use an objective's due date instead. Players never see clocks.

## Quest-wide consequences

Below Objectives, the same panel lets you write rules that fire automatically: "when this becomes true, do this." Each rule has:

- **A condition**: one of **When the quest settles** (nothing left open), **When a clock fills…** (pick the clock), **When an objective becomes…** (pick the objective and the status: Open, Completed, or Failed), or **When a place…** (pick a location and whether it's Explored, Cleared, or Looted).
- **A delay**: an optional number of in-world days between the condition firing and the action happening.
- **An action**: grouped **Objective** (Raise, Reveal to players, Complete, Fail: moves another objective) **Clock** (Tick clock), or **World** (Create calendar event, Send broadcast, Shift an NPC's disposition, Unlock a quest, Grant knowledge, Owe a favor, Award a milestone, Give a handout, Move NPC, Add companion, Shift faction standing).

The newer world actions work like this:

- **Move NPC**: puts an NPC in another place of the campaign (the Atlas location is changed).
- **Add companion**: the NPC joins the party as an ally companion, with hit points, armour class and speed read from their stat block. They arrive unassigned; give them an owner on the Party page.
- **Shift faction standing**: moves the party's standing with a faction, either up or down by steps or straight to a chosen stance, on the same five-step ladder an NPC's disposition uses. See [Factions](#factions).

Each of the three is undone by stepping back with Previous, which puts the NPC, the companion and the standing back as they were. A rule can only name NPCs, places, factions and clocks that belong to this quest's own campaign.

A rule that completes or fails an objective only moves one that is still open (Not yet raised or Open). An objective that has already been Completed or Failed stays settled, and a rule aimed at it does nothing and does not set off the rules watching it. Your own clicks in the Objectives list, and Previous, still change anything.

Beat- and route-scoped rules (the kind that fire when the party arrives at a specific beat, or takes a specific route) live on the beat itself instead: see [Quest Story Flow](#quest-story-flow-beats-routes-objectives)'s Payoff section. This panel is only for rules tied to the quest as a whole, not to one moment in its story.

## Recording what already happened

If you're adopting the beat/route model partway through a campaign, or you improvised sessions the story flow doesn't reflect yet, the Overview's **Record what already happened** panel lets you tick off the beats the party already played, name the session, and record them without ever starting a live run. **Mark as played** applies the beats' consequences without moving the cursor; **Mark as played and put the party at "…"** does the same and places the run cursor at the last beat you selected. Recording the same beat twice warns you first: it appends to the log rather than replacing it.

## Other actions

- **Send to Scriptorium** formats the quest (title, premise, objectives, giver, location) as a publishable document: handy for handouts.
- **Delete quest**, at the bottom of the Overview, removes the quest and its whole story flow. Linked entities, encounters, chat messages, and inventory are not deleted.

## What your players see

Nothing about a quest is visible to players until **Player sharing** names at least one of them. Once shared, the quest appears in their Player Portal journal under the **Quest Log** tab, showing its title, status, premise, visible objectives, and its own story-so-far, covered fully in [Quest Story Flow](#quest-story-flow-beats-routes-objectives).

## Tips

> A quest's premise is capped at one line on purpose: it's what a DM (and a player) reads to remember what the quest is without opening it. Put backstory and lore in the opening beat instead.

- The **Generate** drawer works on every plan, billed to credits, the same as **Type it** and **Paste a page**.
- Deleting an objective that a consequence targets is safe: the rule that referenced it is cleaned up along with it.
- A quest can be a sub-quest of another via **Part of quest**, with no depth limit, but a sub-quest doesn't share beats or a live thread with its parent: each is its own story flow.
- Free plans have a cap on how many quests you can create: see [Billing & Subscription](#billing-subscription).

## Related

- [Quest Story Flow: Beats, Routes & Objectives](#quest-story-flow-beats-routes-objectives)
- [Running a Quest at the Table](#running-a-quest-at-the-table)
- [Quest Designer (AI)](#quest-designer-ai)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Running a Session](#running-a-session)
- [Billing & Subscription](#billing-subscription)
