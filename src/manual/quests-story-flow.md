---
title: "Quest Story Flow: Beats, Routes & Objectives"
section: Quests
section_order: 3
order: 1
summary: How beats, routes, threads and payoff fit together, with a worked example, and how to build and mark the story on the quest's flow.
keywords: story flow, beat, route, objective, thread, parallel, gate, payoff, converge, check, attachment, placement, site, canvas, drawer, label, note, and also, secret, rumored, revealed, take this route, party here, failed, entry, bookmark, undo
---

Grimoire builds a quest as a **story flow**: a web of **beats** connected by **routes**, walked by one or more **threads**. It's built on a visual canvas where you drag connections between boxes, but the ideas behind it map directly onto how you already think about a quest. This page explains the model with a worked example, then covers the quest's page, where you build it: the flow in the middle and a drawer on its right.

## Key ideas

| Term | What it means |
| --- | --- |
| Beat | A single scene or event: past tense, the story's side. "The bandits ambush the wagon." |
| Objective | What the party wants: future tense, the players' side. "Rescue the merchant." A beat raises it, completes it or fails it, and the quest lists them all. |
| Route | A connection from one beat to another. Can be gated by an objective's status. |
| Choice route | A route that moves the thread forward and strands every sibling choice: the normal fork. |
| And also route | A route that opens a *second* thread at its target while the current thread stays exactly where it was. |
| Secret | A beat players hear nothing about until the party arrives. |
| Gate | An optional set of conditions on a route: it only opens while the objectives it names stand in the statuses you chose. You can add several conditions and choose whether all or any of them must hold. No gate = always open. |
| Payoff | What a beat gives when the party arrives or takes a route: consequences (fire automatically) and loot (you hand over). |
| Converge | How a beat with several incoming routes handles more than one thread arriving: "any" (the default) lets each proceed independently, "all" parks each arriving thread for as long as another open thread could still reach the beat, then merges them. |

## A worked example

Say you're running a one-session rescue: bandits have taken a merchant, and the party has to get her back.

1. **Opening beat: "The merchant is missing."** This is the quest's entry, so it's where the run starts. Its Payoff **raises** two objectives: *Rescue the merchant* and *Learn who took her*.
2. From here you draw a **choice route** to **"Confront the bandit camp."** The party tracks the bandits down. On this route (or on arrival at the beat, your choice), a rule **completes** *Learn who took her* once the party identifies the gang.
3. From "Confront the bandit camp," two more choice routes fork the outcome: **"The bandits stand and fight"** and **"The bandits flee with the merchant."** The first leads to a beat whose Payoff **achieves** (completes) *Rescue the merchant*; the second leads to a beat whose Payoff **fails** it and **raises** a new objective, *Track the fleeing bandits*: one beat, ending one objective and starting another in the same breath.
4. Optionally, from "Confront the bandit camp" you also add an **and also** route to **"Meanwhile, the town guard closes the gates."** A side thread that opens without moving the main thread, useful if you want a second thing happening at the same time the party doesn't control directly.

That's the whole shape: beats are the scenes, objectives are the scoreboard, and routes are the story's own logic for which scene comes next and what it means for the party's goals.

## Adding beats

Click **+ Beat** to open the new-beat dialog, fill in a **title** and pick a **kind** (Neutral, Combat, Social, Explore, or Discovery: a presentation hint, not a rule), then **Create beat**. If a beat is already selected, the new beat follows it, and the dialog asks about the route there: **They choose one** or **And also**, and what the party does. **And also** is greyed out until the selected beat already has a choice route, because an "and also" route can never be the only way out of a beat: its thread would have nowhere to go. **Add route** in a beat's prep opens the same dialog. To fit the whole flow on screen or jump to the party's beat, use the two small buttons in the flow's top-right corner.

Drag a connection from one beat to another on the canvas to link two existing beats with a plain choice route.

## The drawer and what it shows

The drawer on the right of the flow shows whatever you've selected: the quest, a beat, or a route. Click empty canvas or press **Esc** to go back to the quest. The address of the page remembers your selection.

The drawer is one column. A **tab on its left edge** opens it wide: the same column stays where it is, and the rest of the beat (or the quest) unfolds to its left, over the flow. Click the tab again, click the strip of flow still showing, press **Esc**, or click anywhere outside the drawer to fold it back.

On a phone the flow is a list of beats and the drawer is a sheet along the bottom. With nothing selected it shows how the quest stands and a **Run** button that selects the beat where the party is. Tap a beat and the sheet rises to show it; swipe it down to let go of the beat. Tap the handle to see the whole quest.

## The quest

With nothing selected the drawer shows the quest, in the order you reach for it:

- **Players read**: one line the players read about the quest. Keep DM secrets out of it.
- **Notes**: yours alone. Premise, goals, themes, prep: anything that belongs to the whole quest and no single scene. Every beat's wide part shows them folded, so you never leave the beat to find them.
- **Objectives**, at the foot, each naming the beat that raises it.

Open it wide for the rest: lane, giver, location, clocks, rules and threads.

## Routes

A route says what the party does and what it costs. Click one on the canvas to edit it in the drawer:

- **What the party does**: a few words, such as "Take Naerth's deal". This is the route's name everywhere it shows.
- **What it costs**: one line, such as "His son goes free; the family loses its boats."
- **Kind**: **Choice** (the party takes one of several ways) or **And also** (it happens next to the main route and opens its own thread). **And also** is off until the beat already has a choice route. Its label names the thread it opens.
- **Gate**: with no conditions the route is always open (the default, and what most routes should stay, since the fork is usually already decided at the table). **Add condition** to gate it. Each condition is an objective plus the statuses that satisfy it, ticked from **Not yet raised**, **Open**, **Completed** and **Failed** (up to three, since all four would mean no condition at all). Ticking several lets you say "unless her trust is broken" as Not yet raised, Open or Completed. With two or more conditions a switch appears: **All of these** (every condition must hold) or **Any of these** (one is enough). A line under the conditions reads the gate back in plain words. An objective can be a condition only once per route.
- Anything the route does when taken.
- **Save route** / **Delete route**.
- **Take this route**, to mark that the party took it (see Marking what happened, below).

A closed route (its gate condition isn't met) shows greyed out on the canvas, and in a beat's **Where it can go** it says why ("needs “Rescue the merchant” completed and “Learn who took her” failed") and can't be chosen. Marking is the deliberate override: **Take this route**, or **Party here** on a beat, records what the table decided even where the story flow's gates say otherwise.

## Several threads meeting at one beat

When a quest has an and-also route and a beat has a way in, selecting that beat shows **When threads arrive** in the drawer, with two choices:

- **Each runs on** (the default): every thread that arrives carries on by itself.
- **Wait for the others**: a thread that arrives waits while any other open thread could still reach this beat. Once none can, the waiting threads merge into one and the beat's payoff fires once.

Waiting only counts threads that are still open and could really get here. A side thread you never opened, one that has ended, or one that has gone somewhere this beat cannot be reached from never holds the others up. That also means alternative endings can all lead into a shared finale without a stand-in beat to funnel them. If the thread you were waiting on ends or wanders off, the waiting threads are released on their own.

## Threads

The quest's **Threads** section (in the wide quest drawer, once it holds a thread) lists every thread the quest is running: its letter, label, and current beat, with **Focus** (centres the canvas on it) and **Close thread** for a live one. Closing a thread is always your call: nothing closes on its own. A quest is born with one thread, "Main"; an "and also" route opens another automatically.

## How a beat looks on the flow

Each beat's colour says where it sits in the story: **gold** where the party is, **green** the start (the entry), **white** already past, **light grey** still to come. Gold wins over green, and green over white.

A small bookmark in the beat's corner says what happened to it. You never click it. **Grey** means untouched, **green** done, **gold** the party is here, **red with an x** failed, and **dark and slashed, with the title struck through**, unreachable: a route the party didn't take cut it off.

The toolbar above the flow shows a tally (visited, live, ahead, cut off) and, if any beats need something, **N prep gaps**: a menu listing each one that takes you to that beat.

## What players know

Every beat on the flow carries three small circles on a line, filled as far as the players have got: **hidden**, **rumored**, **revealed**. You rarely set them. Moving the party sets them:

- **The party arrives**: the beat is revealed. A beat they have been to never shows as less.
- **The party is one route away**: the beat is rumored, on its own. The beats one route away are the party's options, and a choice needs its options in view.
- **A secret beat skips the rumour.** Tick **Secret** on a twist, an ambush or a private offer, and players hear nothing until they arrive.
- **Undo takes it back.** Whatever the move showed, Undo hides again.

By hand you can move a beat further ahead (a rumour the party heard sessions early), but never behind where the party has been. There is no preview: the circles are what players know, and the lines they read sit on the beat.

A quest has no sharing setting of its own. Players can see a quest as soon as one of its beats is rumored or revealed, and not before. Moving a quest to Active on the board rumors its opening beat, which is what makes it appear, and the first beat that shows tells the table "Quest shared" in chat. Undo hides a beat again, and a quest with no visible beat disappears from the players' log.

### Showing a beat to only some players

Under the three circles of a beat, a small line says who it is shown to: "Whole party" to begin with. Click it and tick the players who should see this beat. Untick one to leave them out, or choose "Whole party" to go back to everyone. At least one player must stay ticked. A beat you have not shown yet keeps its choice and uses it when you do show it.

A quest follows its beats. If every beat you have shown is for some players only, only those players see the quest, and the quest's heading tells you who ("Shown to Brannigan and Edda"). As soon as one shown beat is for the whole party, the whole party sees the quest. The "Quest shared" message in chat is posted only when a beat for the whole party is shown. On the story flow, a beat for only some players carries a small chip such as "2 of 4".

## Selecting a beat

Click a beat and the drawer shows it in table order: where it is and its title, the marks (**Entry**, **Party here**, **Failed**) with its three circles, then the **read-aloud**, the **description** and **How it plays**. **Edit text** turns them into fields that save as you type. At the foot, **Where it can go** draws the routes out as a fork: what the party does, what it costs, where it leads, and **Take** on each route while the party is here. Choices read as one solid line ("They choose one"); and-also routes hang off a dashed one.

Open the drawer wide for the rest, in this order: the site, if the beat plays out at one; who and what is here; loot; the quest's notes; what players read; what happens when the party gets here; prep.

## Marking what happened

You can record what the party did right on the flow, without running anything live and without switching to a mode.

- **Take this route.** Select a route. The drawer says what taking it will do (which beat it marks done, which payoffs fire, which other choices become unreachable, or that it opens a thread, for a parallel route), with ticks for **Party here** and for loot to **Hand out**. Selecting a route never commits; **Take this route** does. Choices not taken become unreachable; parallel routes stay open.
- **Entry, Party here, Failed.** On a beat, tick one. **Entry** is the beat the story begins at, and there's only one per quest: ticking it on another beat moves it. **Party here** puts the party's thread there, and ticking it on another beat moves it. **Failed** marks a beat the party didn't get past; the payoffs you set to fire **if it goes wrong** fire, and the payoffs for arriving don't fire a second time.
- **Mark a route from further back.** Where the party stands decides what a route offers. If the route leaves from the beat the party is at, the button reads **Take this route**. If the route lies ahead, it reads **Mark as taken**, and the drawer says what it fills in on the way ("Marks Approaching the Lodge done on the way"). If the party is already past it, or an earlier choice cut it off, the button is greyed out and says why; to go back, use Undo.
- **The way there is filled in.** Mark a route or a beat further along and Grimoire marks the beats in between, so you don't tick ten of them. When more than one way leads there (two routes through the kennels or the tunnel, say), the drawer lists them and you pick the one the party took before the button works. For a beat, ticking **Party here** or **Failed** opens a small list of the ways first. The order matters because the players' quest log is told in the order the beats were filled in. With only one way, there is nothing to pick.
- **An and-also route opens a thread**, just as it does at the table.
- **Undo** (toolbar, or **⌘Z** / **Ctrl+Z**) takes back the newest move in one go, including the beats it filled in and any thread it opened. It works on moves you played live as well as ones you marked.
- Marks are filed under the session in **Marks go to** in the toolbar. Marking never starts a session.

## The wide beat

Everything saves as you type, so there is no edit mode and no Save button. The wide part, left to right and top to bottom:

- **What players read**: the lines players read while the beat is rumored and once it's revealed, and the **Secret** tick.
- **Placements**: the material this beat needs: Encounter, NPC, Faction, Item, Monster, Sound, Audio scene, Playlist, Note, Handout, or a **Check** (a skill, a DC, an optional contested-by skill and note, prepared here and rolled at the table). Mark each **Needed** (flags a prep gap if it goes missing) or **Optional**. A **Check** leads with its roll. The beat's site is here too (see below).
- **When the party gets here**: this beat's payoff, one list combining its consequences and loot, each tagged **auto** (fires by itself) or **you dispatch** (you hand it over). Objectives live here: a beat can **raise**, **complete** or **fail** them. **New objective this beat raises** adds a new objective and the rule that raises it in one step, and it stays hidden from players until the party gets here. Quick-adds cover the common cases without opening a full condition form: **Item**, **Riches** (loot); **Influence**, **Knowledge**, **Quest**, **Favour**, **Milestone**, **Event**, **Handout**, **Tick clock**, **Move NPC**, **Companion**, **Standing** (consequences). **Move NPC** puts an NPC in another place, **Companion** brings an NPC into the party as an ally (with the hit points, armour class and speed from their stat block, unassigned until you give them an owner on the Party page), and **Standing** moves the party's standing with a faction up or down the same five-step ladder an NPC's stance uses. A payoff can fire when the party arrives or **if it goes wrong**, when the beat is failed. Each can be taken back with Undo.
- **Prep**: what is still missing, the beat's kind and where it plays.
- **Fill with AI**: with AI on for the campaign, a **Fill** control at the top of the beat's text fields drafts a title, read-aloud and DM lead. It reads the quest, the beats before and after this one, the objectives still open and the place the beat is staged at, so the draft continues your story rather than starting a new one. Add a steer if you like ("a tense negotiation"). It never overwrites without asking: if the beat already has read-aloud or DM lead text, you are asked before anything is spent, and the title is only replaced when it is still blank. Each fill costs credits, shown beside the button, and the draft is marked as AI-written until you edit it.

## Objectives

An objective belongs to a beat. Players see it once a beat raises it, and not before, so you never switch an objective on by hand. The quest's objective list sits at the foot of the quest drawer, each objective naming the beat that raises it.

## Staging a beat at a site

If a beat plays out somewhere with its own floor plan, the **Site** panel's **Choose site** (in the wide beat) lets you stage it there. Once staged, the panel shows:

- **Opens at**: the party's entry room when the party enters the site (or "the site itself" if none is chosen).
- **Prepared on the way**: traps, encounters and puzzles reachable from that entry point.
- **Ambience**: the resolved theme that plays.
- **Site readiness**: whether the floor plan is published and its ways out are traced; an unready site is flagged as its own beat gap.

See [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for building the floor plan itself.

## What your players see

Nothing about a beat is visible until it is at least "rumored" (see What players know), and a quest shows only once one of its beats does. An objective shows once a beat has raised it. In the Player Portal, a visible quest's **Story so far** shows one column per thread the party has heard from (a thread with nothing revealed yet doesn't get a column at all): a rumored beat renders as "_Rumoured:_ …", a revealed one shows its reveal copy, both in story order. Any knowledge granted or loot dropped at a beat shows as a chip underneath it; claimable loot links into campaign chat, where the actual claim button lives. The one beat a live thread currently stands on is marked "happening now."

## Tips

> Only one route exists between any given pair of beats. Two different outcomes from the same fork ("killed him" / "spared him") are two different target beats, not two labels on one edge: the target beat's own title is the outcome.

- An "and also" route can never be the only way out of a beat: add a choice route first.
- **Kind** is a presentation hint only; it never restricts which attachments a beat can carry.
- Settled is final: a rule that completes or fails an objective only touches one that is still open (Not yet raised or Open). An objective that is already Completed or Failed stays that way, and does not set off the rules watching it a second time. Your own marks and Undo still change anything.
- Prep gaps (shown as chips on the flow and in the toolbar's **N prep gaps** list) flag missing required material, an unwritten guidance field, or an unready staged site: not a design defect, just something left to fill in before the table gets there.

## Related

- [Quest Log](#quest-log)
- [Running a Quest at the Table](#running-a-quest-at-the-table)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [NPC Tracker: Overview](#npc-tracker-overview)
- [Encounter Builder](#encounter-builder)
