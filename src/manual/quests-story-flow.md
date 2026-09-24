---
title: Quest Story Flow — Beats, Routes & Objectives
section: Quests
section_order: 3
order: 1
summary: How beats, routes, threads and payoff fit together — with a worked example — and how to build the story on the Story Flow tab.
keywords: story flow, beat, route, objective, thread, parallel, gate, payoff, converge, check, attachment, placement, site, canvas
---

Grimoire builds a quest as a **story flow**: a web of **beats** connected by **routes**, walked by one or more **threads**. It's built on a visual canvas where you drag connections between boxes — but the ideas behind it map directly onto how you already think about a quest. This page explains the model with a worked example, then covers the **Story Flow** tab (one of the three tabs on a quest's page, alongside Overview and Run) where you build it.

## Key ideas

| Term | What it means |
| --- | --- |
| Beat | A single scene or event — past tense, the story's side. "The bandits ambush the wagon." |
| Objective | What the party wants — future tense, the players' side. "Rescue the merchant." Lives on the quest overview, not on any one beat. |
| Route | A connection from one beat to another. Can be gated by an objective's status. |
| Choice route | A route that moves the thread forward and strands every sibling choice — the normal fork. |
| Parallel route | A route that opens a *second* thread at its target while the current thread stays exactly where it was. |
| Gate | An optional condition on a route: it only opens while a named objective stands in a particular status. No gate = always open. |
| Payoff | What a beat gives when the party arrives or takes a route: consequences (fire automatically) and loot (you hand over). |
| Converge | How a beat with several incoming routes handles more than one thread arriving — "any" (the default) lets each proceed independently, "all" parks every arriving thread until they've all arrived, then merges them. |

## A worked example

Say you're running a one-session rescue: bandits have taken a merchant, and the party has to get her back.

1. **Opening beat — "The merchant is missing."** This is the beat with no incoming route, so it's where the run starts. Its Payoff **raises** two objectives: *Rescue the merchant* and *Learn who took her*.
2. From here you draw a **choice route** to **"Confront the bandit camp."** — the party tracks the bandits down. On this route (or on arrival at the beat, your choice), a rule **completes** *Learn who took her* once the party identifies the gang.
3. From "Confront the bandit camp," two more choice routes fork the outcome: **"The bandits stand and fight"** and **"The bandits flee with the merchant."** The first leads to a beat whose Payoff **achieves** (completes) *Rescue the merchant*; the second leads to a beat whose Payoff **fails** it and **raises** a new objective, *Track the fleeing bandits* — one beat, ending one objective and starting another in the same breath.
4. Optionally, from "Confront the bandit camp" you also add a **parallel route** to **"Meanwhile, the town guard closes the gates."** — a side thread that opens without moving the main thread, useful if you want a second thing happening at the same time the party doesn't control directly.

That's the whole shape: beats are the scenes, objectives are the scoreboard, and routes are the story's own logic for which scene comes next and what it means for the party's goals.

## Adding beats

Click **Add beat** to open the beat composer, fill in a **title** and pick a **kind** (Neutral, Combat, Social, Explore, or Discovery — a presentation hint, not a rule), then **Create beat**. If a beat is already selected, the new beat is added with a route already drawn from it — this is the fastest way to extend a chain. **Add parallel route** does the same but is disabled until the selected beat already has a choice route (a parallel route can never be the only way out of a beat, since its own thread would have nowhere to go); it asks for a **thread label** as well, shown to the DM and on the player-facing story thread.

Drag a connection from one beat to another on the canvas to link two existing beats with a plain choice route.

## Editing a route

Click a route on the canvas to open **Selected route** in the side rail:

- **Route kind** — Choice or Parallel (Parallel is disabled here too until the beat has a choice route).
- A **thread label** field, for a parallel route.
- **Route gate** — **No gate — always open** (the default, and what most routes should stay, since the fork is usually already decided at the table) or **Open while an objective is [Open / Completed / Failed]**, with an objective picker.
- Any consequences already attached to this route, with an **Edit** shortcut into the beat page.
- **Save route** / **Delete route**.

A closed route (its gate condition isn't met) shows greyed out on the canvas, and in the Run cockpit its **Choose** button is disabled with the reason ("Closed — needs … to be …, currently …"). **Jump**, in the Run cockpit, still reaches a closed beat directly — the deliberate override for when the table decides something the story flow doesn't know about, and it always asks for a reason.

## Threads

The rail's **Threads** panel lists every thread the quest is running: its letter, label, and current beat, with **Focus** (centres the canvas on it) and **Close thread** for a live one. Closing a thread is always your call — nothing closes on its own. A quest is born with one thread, "Main"; a parallel route opens another automatically, and the Run cockpit's thread bar can open one by hand too.

## Selecting a beat

Click a beat with no route selected to see **Selected beat**: its kind and visibility, chips for prep gaps, payoff count, held loot, converge mode, and — if staged at a site — a room count. **Open beat** goes to its full page; **Preview as players** shows exactly what a player would see at its current visibility.

## The beat page

Click **Open beat** (or a beat on mobile) to reach its full page, with everything about that one beat:

- **Beat** — kind, staged location (see Sites below), visibility, each saved the moment you change it.
- **Read aloud** — the boxed text you read at the table.
- **DM lead**, **How it plays** — free text, autosaved.
- **Rumor copy** / **Reveal copy** — the exact text players see while the beat is rumored, and once it's revealed.
- **Placements** — the material this beat needs: Encounter, NPC, Faction, Item, Monster, Sound, Audio scene, Playlist, Note, Handout, or a **Check** (a skill, a DC, an optional contested-by skill and note — prepared here, rolled at the table). Mark each **Needed** (flags a prep gap if it goes missing) or **Optional**.
- **Routes out** — every outgoing route, with its kind, target, and a site chip if the destination is staged at a room-bearing site.
- **Payoff** — one list combining this beat's consequences and loot, each tagged **auto** (fires by itself) or **you dispatch** (you hand it over). Eight quick-adds cover the common cases without opening a full condition form: **Item**, **Riches** (loot); **Influence**, **Knowledge**, **Quest**, **Favour**, **Milestone**, **Event** (consequences).
- **Site** — see below.

**Revealing a beat.** The action row (or the phone dock) carries **Reveal to players** (for a hidden beat) or **Reveal fully** (for a rumored one). Revealing is separate from advancing — moving a thread onto a beat doesn't reveal it by itself.

## Staging a beat at a site

If a beat plays out somewhere with its own floor plan, the **Site** panel's **Choose site** lets you stage it there. Once staged, the panel shows:

- **Opens at** — the party's entry room when Run enters the site (or "the site itself" if none is chosen).
- **Prepared on the way** — traps, encounters and puzzles reachable from that entry point.
- **Ambience** — the resolved theme that plays.
- **Site readiness** — whether the floor plan is published and its ways out are traced; an unready site is flagged as its own beat gap.

See [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for building the floor plan itself.

## What your players see

Nothing about a beat is visible until its **visibility** reaches at least "rumored," and the quest itself has to be shared first. In the Player Portal, a shared quest's **Story so far** shows one column per thread the party has heard from (a thread with nothing revealed yet doesn't get a column at all) — a rumored beat renders as "_Rumoured:_ …", a revealed one shows its reveal copy, both in story order. Any knowledge granted or loot dropped at a beat shows as a chip underneath it; claimable loot links into campaign chat, where the actual claim button lives. The one beat a live thread currently stands on is marked "happening now."

## Tips

> Only one route exists between any given pair of beats. Two different outcomes from the same fork ("killed him" / "spared him") are two different target beats, not two labels on one edge — the target beat's own title is the outcome.

- A parallel route can never be the only way out of a beat — add a choice route first.
- **Kind** is a presentation hint only; it never restricts which attachments a beat can carry.
- Prep gaps (shown as chips throughout Story Flow) flag missing required material, an unwritten guidance field, or an unready staged site — not a design defect, just something left to fill in before the table gets there.

## Related

- [Quest Log](#quest-log)
- [Running a Quest at the Table](#running-a-quest-at-the-table)
- [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [NPC Tracker — Overview](#npc-tracker-overview)
- [Encounter Builder](#encounter-builder)
