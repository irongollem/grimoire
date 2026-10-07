---
title: Running a Quest at the Table
section: Quests
section_order: 3
order: 2
summary: "The Run cockpit: starting a session, advancing the story, managing threads, and handling payoff and sites live at the table."
keywords: run, cockpit, advance, thread, jump, pause, resume, held payoff, dispatch, session, improvise, site handoff, hotkeys
---

The **Run** tab (one of a quest's three tabs, alongside Overview and Story Flow, or just open a quest while a session is live, since Run is the default landing then) is where you actually play a quest at the table. It walks one thread of the story flow at a time, showing the current beat, what can happen next, and everything you need to react to what the table does.

## Key ideas

| Term | What it means |
| --- | --- |
| Session status | idle → running → paused → (waiting, for a parked thread) → ended. |
| Thread bar | The row of pills across the top, one per thread the quest holds, for switching which one the cockpit is showing. |
| Advance | Recording what happens next: the route taken, any parallel routes that open alongside it, and which payoff fires now versus later. |
| Held payoff | A consequence or piece of loot that's already fired but is still waiting for you to hand it over or announce it. |
| Clock | A progress clock with 2 to 12 segments that you tick at the table. When it fills, the rules watching it fire. |
| Site handoff | What the cockpit shows instead of the beat card when the current beat is staged at a site with rooms. |

## Starting a run

The first time you open Run on a thread, Grimoire tells you where to start rather than asking. It resolves, in order: a bridge that just brought the party in from another quest ("Entered through '…'"), the quest's declared entry beat ("Where the story begins"), or, if there's exactly one, the sole beat with no incoming route ("The only way in"). It shows that beat's title and opening text with a single **Start here**. **Start elsewhere** reveals the full picker (every beat, roots ranked first) if you know better. When nothing resolves automatically (no declared entry and more than one candidate root), the picker shows itself immediately: choose a beat under **Choose a starting beat…** and click **Start run**. Starting doesn't reveal anything to players by itself.

## Reading the current beat

The beat card shows a **Party is here · Thread X** badge, the beat's kind, visibility and staged place, any prep-gap chips, the **read aloud** text, and, folded away on a narrower screen, DM notes and how it plays. One button per placement lets you act on it directly: a **Check** attachment leads with its roll (e.g. **Roll Insight**), and every other placement opens the relevant material in a contained view without leaving the cockpit; **Edit beat** and the reveal action sit alongside them.

## Advancing the story

Below the beat card (or behind the phone dock's **What happens next · N**), every outgoing route is listed as its own card: a **choice** route shows **Choose** and **Preview**; a **parallel** route shows as "opens alongside" with the thread it would spawn. A final card, **Something else…**, covers anything the story flow didn't predict.

Clicking **Choose** or **Something else…** doesn't move anything by itself: it opens the **Advance** dialog, which is the one place a transition is actually recorded:

1. **The route taken**: pick the route (or **Something else happened**, which names an improvised beat: a required title, with kind, reason, DM lead, reveal text, and two checkboxes, offer a return to the current beat, and keep an "Improvised" connection in the story flow, tucked behind **Add details**).
2. **Also opens**: every parallel route off the beat, ticked by default; each one spawns its own thread right along with this move. Untick to prepare the layer without opening it yet.
3. **Payoff from this route**: every consequence on the chosen route, ticked to fire now and unticked to **hold** it for later; every loot row, ticked to drop to chat with the move and unticked to keep it in the cockpit until you dispatch it.

The footer previews the plan (which thread letters stay live, how many consequences fire, how many loot rows stay held) before you click **Advance**. If another device moved the same thread first, you'll see "The session moved on another device. Reopen to advance." rather than a silent overwrite.

## Managing threads mid-session

The **thread bar** shows one pill per thread: live and waiting ones are clickable, closed and merged ones are shown dimmed for context. Switching is pure navigation: nothing moves and nothing is recorded. **Open a thread** lets you start a second thread by hand (pick a beat, a label, and an optional reason), separate from a parallel route's automatic open.

## Session controls

The **Session** card carries the table-wide commands, independent of what the current beat offers: **Previous** (undo, truncating anything abandoned by moving forward again), **Jump…** (search for and jump straight to any beat, with a required reason: the deliberate override that ignores gates), **Pause** / **Resume**, and **End session** (pauses every running thread; a thread parked waiting for a converge stays waiting). Keyboard shortcuts: **Alt+←** previous, **Alt+→** advances when exactly one route is open, **J** opens Jump.

## Clocks

If the quest has progress clocks (you add them on the quest Overview), a **Clocks** card in the cockpit shows each one as a dial with a label and "2 of 6"-style progress. Use the **+** and **-** buttons to tick or untick it as the table makes progress. A clock never ticks on its own: only you do, or a payoff rule that ticks it. When a tick fills the last segment, the rules watching that clock fire at once and a toast tells you so. Unticking a full clock does not undo what it already did; use the quest log's Previous for that.

Deadlines are the calendar's job instead. An objective with a **due date** shows it in the cockpit's objectives list ("due in 3 days", or "overdue" in red). When your campaign's date moves forward past that day, an objective that is still Open fails on its own, under "Deadline passed", and the rules watching it fire. See [Quest Log](#quest-log) for setting both.

## When the last objective is resolved

Once every objective is Completed or Failed, the cockpit shows a prompt at the top: **Every objective is resolved.** with **Mark completed**, **Mark failed** and **Keep running**. Grimoire never closes the quest for you; this is the nudge. **Keep running** hides the prompt until you reload.

## Held payoff

Anything the quest has already fired but you haven't handed to the table yet, loot sitting unclaimed, or a consequence you held back in the Advance dialog, collects in **Held payoff**, quest-wide rather than tied to one beat. Each entry gets **Dispatch** (loot, drops it to chat) or **Fire now** (a held consequence, performs it). A held consequence waits for you even if it also carries a delay: it never fires just because its day arrives.

## Running a beat staged at a site

When the current beat is staged at a site with rooms, the beat card is replaced by the **site handoff**: the room list, the floor plan, the current room's read-aloud and prompts (traps, checks, encounters, secret doors), and its ways out (**Move** / **Unlock** / **Reveal** per door). **Show map to players** / **Hide map from players** toggles what the party sees; Click any room, in the list or on the plan, to move the party there. Rooms that no open way leads to from the party's room are dimmed, and Grimoire asks before moving the party into one; a site with no ways out drawn yet makes no such claim, so every room is one click away. **Leave site** dismisses the handoff for this visit without moving the thread, and **Enter site** on the beat card brings it back with the party still in the same room; **Advance beat** opens the same Advance dialog as everywhere else. While the site is open it takes the cockpit's full width, so the side column (objectives, story so far, also open) steps aside and comes back when you leave the site. This is the same room surface the Atlas's own Run action uses: see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for building and running sites in full.

## What your players see

The run cockpit itself (where each thread stands, the history of what's happened, the thread list) is entirely DM-only. What players see is exactly what beat visibility and Player sharing already expose, covered in [Quest Story Flow](#quest-story-flow-beats-routes-objectives). **Preview as players**, available throughout the cockpit, shows you that exact view for a chosen party member without leaving the table.

## Tips

> **Jump** is the deliberate override: it reaches a closed or unconnected beat directly and always asks for a reason, because it means the table decided something the story flow's gates don't know about.

- Reveal is separate from advancing. Moving a thread onto a beat never reveals it to players on its own: use the Reveal button when you're ready.
- A beat set to **Wait for the others** parks each arriving thread while another open thread could still reach it, then merges them and fires its arrival rules once: you'll see the parked thread as "waiting" rather than live. Threads that never opened, have ended or have gone elsewhere do not hold it up, and a waiting thread is released as soon as nothing can reach the beat any more.
- A route you cannot choose shows why on its card (for example "needs “Rescue the merchant” completed or “Bribe the guard” completed"), including parallel routes.

## Related

- [Quest Log](#quest-log)
- [Quest Story Flow: Beats, Routes & Objectives](#quest-story-flow-beats-routes-objectives)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Running a Session](#running-a-session)
- [Encounter Runner](#encounter-runner)
