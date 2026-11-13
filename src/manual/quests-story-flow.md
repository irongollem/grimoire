---
title: "Quest Story Flow: Beats, Routes & Objectives"
section: Quests
section_order: 3
order: 1
summary: How beats, routes, threads and payoff fit together, with a worked example, and how to build and mark the story on the quest's flow.
keywords: story flow, beat, route, objective, thread, parallel, gate, payoff, converge, check, attachment, placement, site, canvas, drawer, take this route, party here, failed, entry, bookmark, undo
---

Grimoire builds a quest as a **story flow**: a web of **beats** connected by **routes**, walked by one or more **threads**. It's built on a visual canvas where you drag connections between boxes, but the ideas behind it map directly onto how you already think about a quest. This page explains the model with a worked example, then covers the quest's page, where you build it: the flow in the middle and a drawer on its right.

## Key ideas

| Term | What it means |
| --- | --- |
| Beat | A single scene or event: past tense, the story's side. "The bandits ambush the wagon." |
| Objective | What the party wants: future tense, the players' side. "Rescue the merchant." Lives in the quest panel, not on any one beat. |
| Route | A connection from one beat to another. Can be gated by an objective's status. |
| Choice route | A route that moves the thread forward and strands every sibling choice: the normal fork. |
| Parallel route | A route that opens a *second* thread at its target while the current thread stays exactly where it was. |
| Gate | An optional set of conditions on a route: it only opens while the objectives it names stand in the statuses you chose. You can add several conditions and choose whether all or any of them must hold. No gate = always open. |
| Payoff | What a beat gives when the party arrives or takes a route: consequences (fire automatically) and loot (you hand over). |
| Converge | How a beat with several incoming routes handles more than one thread arriving: "any" (the default) lets each proceed independently, "all" parks each arriving thread for as long as another open thread could still reach the beat, then merges them. |

## A worked example

Say you're running a one-session rescue: bandits have taken a merchant, and the party has to get her back.

1. **Opening beat: "The merchant is missing."** This is the quest's entry, so it's where the run starts. Its Payoff **raises** two objectives: *Rescue the merchant* and *Learn who took her*.
2. From here you draw a **choice route** to **"Confront the bandit camp."** The party tracks the bandits down. On this route (or on arrival at the beat, your choice), a rule **completes** *Learn who took her* once the party identifies the gang.
3. From "Confront the bandit camp," two more choice routes fork the outcome: **"The bandits stand and fight"** and **"The bandits flee with the merchant."** The first leads to a beat whose Payoff **achieves** (completes) *Rescue the merchant*; the second leads to a beat whose Payoff **fails** it and **raises** a new objective, *Track the fleeing bandits*: one beat, ending one objective and starting another in the same breath.
4. Optionally, from "Confront the bandit camp" you also add a **parallel route** to **"Meanwhile, the town guard closes the gates."** A side thread that opens without moving the main thread, useful if you want a second thing happening at the same time the party doesn't control directly.

That's the whole shape: beats are the scenes, objectives are the scoreboard, and routes are the story's own logic for which scene comes next and what it means for the party's goals.

## Adding beats

Click **Add beat** to open the beat composer, fill in a **title** and pick a **kind** (Neutral, Combat, Social, Explore, or Discovery: a presentation hint, not a rule), then **Create beat**. If a beat is already selected, the new beat is added with a route already drawn from it. This is the fastest way to extend a chain. **Add parallel route** does the same but is disabled until the selected beat already has a choice route (a parallel route can never be the only way out of a beat, since its own thread would have nowhere to go); it asks for a **thread label** as well, shown to the DM and on the player-facing story thread.

Drag a connection from one beat to another on the canvas to link two existing beats with a plain choice route.

## The drawer and what it shows

The drawer on the right of the flow shows whatever you've selected: the quest, a beat, or a route. Click empty canvas or press **Esc** to go back to the quest. **Open** on a beat pulls the whole beat open over the flow (see below); **Flow** at its top puts it back. The address of the page remembers your selection.

On a phone the flow is a list of beats and the drawer is a sheet along the bottom. With nothing selected it shows how the quest stands and a **Run** button that opens the beat where the party is. Tap a beat and the sheet rises to show it; swipe it down to let go of the beat. Tap the handle to see the whole quest.

## Editing a route

Click a route on the canvas to see it in the drawer:

- **Route kind**: Choice or Parallel (Parallel is disabled here too until the beat has a choice route).
- A **thread label** field, for a parallel route.
- **Gate**: with no conditions the route is always open (the default, and what most routes should stay, since the fork is usually already decided at the table). **Add condition** to gate it. Each condition is an objective plus the statuses that satisfy it, ticked from **Not yet raised**, **Open**, **Completed** and **Failed** (up to three, since all four would mean no condition at all). Ticking several lets you say "unless her trust is broken" as Not yet raised, Open or Completed. With two or more conditions a switch appears: **All of these** (every condition must hold) or **Any of these** (one is enough). A line under the conditions reads the gate back in plain words. An objective can be a condition only once per route.
- Any consequences already attached to this route.
- **Save route** / **Delete route**.
- **Take this route**, to mark that the party took it (see Marking what happened, below).

A closed route (its gate condition isn't met) shows greyed out on the canvas, and on an opened beat it says why ("needs “Rescue the merchant” completed and “Learn who took her” failed") and can't be chosen. Marking is the deliberate override: **Take this route**, or **Party here** on a beat, records what the table decided even where the story flow's gates say otherwise.

## Several threads meeting at one beat

When a quest has a parallel route and a beat has a way in, selecting that beat shows **When threads arrive** in the drawer, with two choices:

- **Each runs on** (the default): every thread that arrives carries on by itself.
- **Wait for the others**: a thread that arrives waits while any other open thread could still reach this beat. Once none can, the waiting threads merge into one and the beat's payoff fires once.

Waiting only counts threads that are still open and could really get here. A side thread you never opened, one that has ended, or one that has gone somewhere this beat cannot be reached from never holds the others up. That also means alternative endings can all lead into a shared finale without a stand-in beat to funnel them. If the thread you were waiting on ends or wanders off, the waiting threads are released on their own.

## Threads

The quest panel's **Threads** section lists every thread the quest is running: its letter, label, and current beat, with **Focus** (centres the canvas on it) and **Close thread** for a live one. Closing a thread is always your call: nothing closes on its own. A quest is born with one thread, "Main"; a parallel route opens another automatically, and **Open a thread**, on the thread bar above an opened beat, can open one by hand too.

## How a beat looks on the flow

Each beat's colour says where it sits in the story: **gold** where the party is, **green** the start (the entry), **white** already past, **light grey** still to come. Gold wins over green, and green over white.

A small bookmark in the beat's corner says what happened to it. You never click it. **Grey** means untouched, **green** done, **gold** the party is here, **red with an x** failed, and **dark and slashed, with the title struck through**, unreachable: a route the party didn't take cut it off.

The toolbar above the flow shows a tally (visited, live, ahead, cut off) and, if any beats need something, **N prep gaps**: a menu listing each one that takes you to that beat. The **View** switch, **Your view** / **Players' view**, shows the flow as the party knows it.

## Selecting a beat

Click a beat to see its summary in the drawer: its kind and visibility, chips for prep gaps, payoff count, held loot, converge mode, and, if staged at a site, a room count. **Open** pulls the whole beat open, and **Preview as players** shows exactly what a player would see at its current visibility.

The beat's summary has the marks row: **Entry**, **Party here** and **Failed**.

## Marking what happened

You can record what the party did right on the flow, without running anything live and without switching to a mode.

- **Take this route.** Select a route. The drawer says what taking it will do (which beat it marks done, which payoffs fire, which other choices become unreachable, or that it opens a thread, for a parallel route), with ticks for **Party here** and for loot to **Hand out**. Selecting a route never commits; **Take this route** does. Choices not taken become unreachable; parallel routes stay open.
- **Entry, Party here, Failed.** On a beat, tick one. **Entry** is the beat the story begins at, and there's only one per quest: ticking it on another beat moves it. **Party here** puts the party's thread there, and ticking it on another beat moves it. **Failed** marks a beat the party didn't get past; the payoffs you set to fire **if it goes wrong** fire, and the payoffs for arriving don't fire a second time.
- **The way there is filled in.** Mark a beat further along and Grimoire marks the beats in between, along the shortest route, so you don't tick ten of them.
- **A parallel route opens a thread**, just as it does at the table.
- **Undo** (toolbar, or **⌘Z** / **Ctrl+Z**) takes back the newest move in one go, including the beats it filled in and any thread it opened. It works on moves you played live as well as ones you marked.
- Marks are filed under the session in **Marks go to** in the toolbar. Marking never starts a session.

## Opening a beat

**Open** on a beat (or a beat on a phone) pulls the whole beat open over the flow. There's no separate edit mode and no Play/Prep switch: everything saves as you type. The table's side is at the top, the prep at the foot.

- **Read aloud**, the boxed text you read at the table (folded away when a site takes the middle of the page).
- **DM lead** and **How it plays**: your guidance.
- **Placed at this beat**: its placements as chips. A **Check** leads with its roll.
- **Where Advance can go**: the routes out, while the party is here.
- Beside it: the objectives, the clocks, anything held back, and **Players see**.
- At the foot, three folds that are open while the party is elsewhere (when you're preparing it) and closed while it's here:
  - **Rumor and reveal copy**: the beat's kind, staged location, visibility, and the exact text players see while the beat is rumored and once it's revealed.
  - **Attachments**: the material this beat needs: Encounter, NPC, Faction, Item, Monster, Sound, Audio scene, Playlist, Note, Handout, or a **Check** (a skill, a DC, an optional contested-by skill and note, prepared here and rolled at the table). Mark each **Needed** (flags a prep gap if it goes missing) or **Optional**. The beat's site is here too (see below).
  - **Payoffs and routes**: this beat's routes out, and its **Payoff**, one list combining its consequences and loot, each tagged **auto** (fires by itself) or **you dispatch** (you hand it over). Quick-adds cover the common cases without opening a full condition form: **Item**, **Riches** (loot); **Influence**, **Knowledge**, **Quest**, **Favour**, **Milestone**, **Event**, **Handout**, **Tick clock**, **Move NPC**, **Companion**, **Standing** (consequences). **Move NPC** puts an NPC in another place, **Companion** brings an NPC into the party as an ally (with the hit points, armour class and speed from their stat block, unassigned until you give them an owner on the Party page), and **Standing** moves the party's standing with a faction up or down the same five-step ladder an NPC's stance uses. A payoff can fire when the party arrives or **if it goes wrong**, when the beat is failed. Each can be taken back with Undo.
- **Fill with AI**: with AI on for the campaign, a **Fill** control at the top of the beat's text fields drafts a title, read-aloud and DM lead. It reads the quest, the beats before and after this one, the objectives still open and the place the beat is staged at, so the draft continues your story rather than starting a new one. Add a steer if you like ("a tense negotiation"). It never overwrites without asking: if the beat already has read-aloud or DM lead text, you are asked before anything is spent, and the title is only replaced when it is still blank. Each fill costs credits, shown beside the button, and the draft is marked as AI-written until you edit it.

**Revealing a beat.** **Players see** carries **Reveal to players** (for a hidden beat) or **Reveal fully** (for a rumored one), and the beat's summary has a **Hidden / Rumored / Revealed** control. Revealing is separate from advancing: moving a thread onto a beat doesn't reveal it by itself. If the quest isn't shared with anyone yet, revealing or rumoring one of its beats shares the quest with your whole party, since otherwise no one could see it. A quest you shared with only some players stays as you set it.

## Staging a beat at a site

If a beat plays out somewhere with its own floor plan, the **Site** panel's **Choose site** (under **Attachments** on an opened beat) lets you stage it there. Once staged, the panel shows:

- **Opens at**: the party's entry room when the party enters the site (or "the site itself" if none is chosen).
- **Prepared on the way**: traps, encounters and puzzles reachable from that entry point.
- **Ambience**: the resolved theme that plays.
- **Site readiness**: whether the floor plan is published and its ways out are traced; an unready site is flagged as its own beat gap.

See [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for building the floor plan itself.

## What your players see

Nothing about a beat is visible until its **visibility** reaches at least "rumored," and the quest itself has to be shared first. In the Player Portal, a shared quest's **Story so far** shows one column per thread the party has heard from (a thread with nothing revealed yet doesn't get a column at all): a rumored beat renders as "_Rumoured:_ …", a revealed one shows its reveal copy, both in story order. Any knowledge granted or loot dropped at a beat shows as a chip underneath it; claimable loot links into campaign chat, where the actual claim button lives. The one beat a live thread currently stands on is marked "happening now."

## Tips

> Only one route exists between any given pair of beats. Two different outcomes from the same fork ("killed him" / "spared him") are two different target beats, not two labels on one edge: the target beat's own title is the outcome.

- A parallel route can never be the only way out of a beat: add a choice route first.
- **Kind** is a presentation hint only; it never restricts which attachments a beat can carry.
- Settled is final: a rule that completes or fails an objective only touches one that is still open (Not yet raised or Open). An objective that is already Completed or Failed stays that way, and does not set off the rules watching it a second time. Your own marks and Undo still change anything.
- Prep gaps (shown as chips on the flow and in the toolbar's **N prep gaps** list) flag missing required material, an unwritten guidance field, or an unready staged site: not a design defect, just something left to fill in before the table gets there.

## Related

- [Quest Log](#quest-log)
- [Running a Quest at the Table](#running-a-quest-at-the-table)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [NPC Tracker: Overview](#npc-tracker-overview)
- [Encounter Builder](#encounter-builder)
