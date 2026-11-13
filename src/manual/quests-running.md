---
title: Running a Quest at the Table
section: Quests
section_order: 3
order: 2
summary: "Opening a beat to run it: putting the party on a beat, advancing the story, managing threads, and handling payoff and sites live at the table."
keywords: run, opened beat, advance, undo, thread, held payoff, dispatch, session, improvise, site, party here, hotkeys
---

There's no separate screen for running a quest. You run it from the same page you build it on: open the beat the party is standing on and it fills the page, with what you need to read, what to run and where the story can go next. **Run** a quest means opening the party's beat: a live quest on the Dashboard or the session rail takes you straight to it. Or select a beat on the flow and click **Open**. Click **Flow** at the top (or press **Esc**) to shrink it back to the flow.

## Key ideas

| Term | What it means |
| --- | --- |
| Opened beat | One beat pulled open over the flow: read-aloud, guidance, placements, where the story can go, and the prep at its foot. |
| Party here | Which beat a thread's party is standing on. Where it stands decides which actions you get. |
| Thread bar | The row of pills at the top of an opened beat, one per thread the quest holds, for switching which one you're running. |
| Advance | Recording what happens next: the route taken, any parallel routes that open alongside it, and which payoff fires now versus later. |
| Held payoff | A consequence or piece of loot that's already fired but is still waiting for you to hand it over or announce it. |
| Clock | A progress clock with 2 to 12 segments that you tick at the table. When it fills, the rules watching it fire. |

## Starting a run

A quest begins at its **entry** beat, the one with the green fill on the flow. To start, open a beat and click **Put the party here**: that puts the thread there and fires the beat's arrival rules. Put the party on a beat further along and the beats in between are marked as done for you. Starting doesn't reveal anything to players by itself, and it doesn't start a session. **Undo** takes it back.

## Reading the opened beat

The header shows the beat's title with a **Party is here** badge when the party is on it, and its kind and visibility. Beneath it:

- The **read aloud** text, folded away when a site takes the middle of the page.
- Your **DM lead** and **How it plays**.
- The beat's placements as chips. A **Check** leads with its roll (e.g. **Roll Insight**), and every other placement opens its material in place without leaving the beat. A handout opens with **Give to players**.
- **Where Advance can go**, while the party is here, listing each route out. A route you can't take says why first (for example "needs “Rescue the merchant” completed or “Bribe the guard” completed").

Beside it: the objectives, with a due date where there is one ("due in 3 days", or "overdue" in red); the **Clocks**; **Held payoff** when anything is waiting; and **Players see**, with **Reveal to players** (or **Reveal fully** for a rumored beat) and **Preview**. At the foot are the prep folds: the copy players see, the attachments, and the payoffs and routes. They're open while the party is elsewhere and closed while it's here.

## Advancing the story

With the party on a beat, the action row has **Undo** and **Advance**. Click **Advance**, or click a route under **Where Advance can go**, and the **Advance** dialog opens. It's the one place a move at the table is recorded:

1. **The route taken**: pick the route (or **Something else happened**, which names an improvised beat: a required title, with kind, reason, DM lead, reveal text, and two checkboxes, offer a return to the current beat, and keep an "Improvised" connection in the story flow, tucked behind **Add details**).
2. **Also opens**: every parallel route off the beat, ticked by default; each one spawns its own thread right along with this move. Untick to prepare the layer without opening it yet.
3. **Payoff from this route**: every consequence on the chosen route, ticked to fire now and unticked to **hold** it for later; every loot row, ticked to drop to chat with the move and unticked to keep it in Held payoff until you dispatch it.

The footer previews the plan (which thread letters stay live, how many consequences fire, how many loot rows stay held) before you click **Advance**. If another device moved the same thread first, you'll see "The session moved on another device. Reopen to advance." rather than a silent overwrite. When exactly one route is open, **Alt+→** advances along it.

**Undo** takes back the newest move on the quest, whole. It's also in the flow's toolbar, as is **⌘Z** / **Ctrl+Z**. It works on what you played here and on what you marked on the flow afterwards. There is no Previous button and no jumping: to move the party to any beat, open it and click **Put the party here**.

## Managing threads mid-session

The **thread bar** at the top of an opened beat shows one pill per thread: live and waiting ones are clickable, closed and merged ones are shown dimmed for context. Switching is pure navigation: nothing moves and nothing is recorded. **Open a thread** lets you start a second thread by hand (pick a beat, a label, and an optional reason), separate from a parallel route's automatic open. The quest panel's **Threads** section can close one.

Ending a session is done from the session pill, not from the quest: ending it closes the session in your log and every thread stays where it is.

## Clocks

If the quest has progress clocks (you add them in the quest panel), a **Clocks** card beside the opened beat shows each one as a dial with a label and "2 of 6"-style progress. Use the **+** and **-** buttons to tick or untick it as the table makes progress. A clock never ticks on its own: only you do, or a payoff rule that ticks it. When a tick fills the last segment, the rules watching that clock fire at once and a toast tells you so. Unticking a full clock does not undo what it already did; use **Undo** for that.

Deadlines are the calendar's job instead. An objective with a **due date** shows it beside the opened beat. When your campaign's date moves forward past that day, an objective that is still Open fails on its own, under "Deadline passed", and the rules watching it fire. See [Quest Log](#quest-log) for setting both.

## When the last objective is resolved

Once every objective is Completed or Failed, the quest panel's Objectives section shows a prompt: **Every objective is resolved.** with **Mark completed**, **Mark failed** and **Keep running**. Grimoire never closes the quest for you; this is the nudge. **Keep running** hides the prompt until you reload.

## Held payoff

Anything the quest has already fired but you haven't handed to the table yet collects in **Held payoff**, quest-wide rather than tied to one beat: loot on a beat the party has reached that you haven't dropped in chat, and any consequence you held back in the Advance dialog. Loot on beats the party hasn't reached yet stays out of it until they get there. Each entry gets **Dispatch** (loot, drops it to chat) or **Fire now** (a held consequence, performs it). A long list shows its first four and a **Show all** button. A held consequence waits for you even if it also carries a delay: it never fires just because its day arrives.

## Running a beat staged at a site

When the beat is staged at a site with rooms, the site takes the middle of the opened beat: the room list, the floor plan, the current room's read-aloud and prompts (traps, checks, encounters, secret doors), and its ways out (**Move** / **Unlock** / **Reveal** per door). **Show map to players** / **Hide map from players**, in the header, toggles what the party sees. Click any room, in the list or on the plan, to move the party there. Rooms that no open way leads to from the party's room are dimmed, and Grimoire asks before moving the party into one; a site with no ways out drawn yet makes no such claim, so every room is one click away. **Leave site** gives the page back to the beat without moving the thread, and **Enter site** brings the rooms back with the party still in the same room; **Advance beat** opens the same Advance dialog as everywhere else. This is the same room surface the Atlas's own Run action uses: see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for building and running sites in full.

## What your players see

Where each thread stands, the history of what's happened, and the thread list are entirely DM-only. What players see is exactly what beat visibility and Player sharing already expose, covered in [Quest Story Flow](#quest-story-flow-beats-routes-objectives). **Preview** under **Players see**, and **Preview as…** in the quest panel, show you that exact view for a chosen party member without leaving the table.

## Tips

- Reveal is separate from advancing. Moving a thread onto a beat never reveals it to players on its own: use the Reveal button when you're ready. It takes effect at once, with no confirmation. If the quest isn't shared with anyone yet, revealing a beat shares it with your whole party.
- A beat set to **Wait for the others** parks each arriving thread while another open thread could still reach it, then merges them and fires its arrival rules once: you'll see the parked thread as "waiting" rather than live. Threads that never opened, have ended or have gone elsewhere do not hold it up, and a waiting thread is released as soon as nothing can reach the beat any more.
- If the table does something the flow didn't plan, **Put the party here** on any beat, or **Something else happened** in the Advance dialog, records it without fighting the gates.

## Related

- [Quest Log](#quest-log)
- [Quest Story Flow: Beats, Routes & Objectives](#quest-story-flow-beats-routes-objectives)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Running a Session](#running-a-session)
- [Encounter Runner](#encounter-runner)
