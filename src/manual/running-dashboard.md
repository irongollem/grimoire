---
title: Dashboard
section: Running the Table
section_order: 1
order: 0
summary: The campaign's home screen — a board of widgets that rearranges itself between prep and the table, and that you can rearrange yourself.
keywords: dashboard, home, widgets, customize, layout, prep, at the table, session, widget catalog, reset
---

The Dashboard is where Grimoire lands you. It's a grid of cards ("widgets") summarising the parts of your campaign you check most — quests in progress, party HP, what still needs prepping, what happened last session — and it is the first thing you see when you open the app (**Campaign → Dashboard** in the sidebar, or just `/`).

## Key ideas

| Term | Meaning |
| --- | --- |
| Surface | Which of two boards you're looking at: **Prep** (what needs work before the table sits down) or **At the table** (what matters while you're running it). The dashboard switches automatically when you start or end a session, and you can override it manually. |
| Widget | One card on the board — Party, Quests, Recent NPCs, a dice roller, and so on. Over 30 exist; only a handful show by default. |
| Layout | Your personal arrangement of widgets — which ones you've added, their size, and their order. Saved per campaign, so it follows you between devices. |
| Customize mode | The editing state where you can add, remove, resize and reorder widgets. |

## Switching surfaces

The dashboard normally shows **Prep** while no session is running and **At the table** while one is — that's the point of the switch: starting a session changes what's in front of you, not just a status somewhere in the chrome.

1. Use the **Prep** / **At the table** toggle near the top of the page to look at the other surface without changing what's actually running (useful mid-session if you want to check what still needs prepping for next time).
2. Switching back to whichever side your session state would have picked anyway clears the override, so the page doesn't get stuck showing the wrong surface for the rest of the evening.

## Customizing your board

1. Click **Customize** in the page header. The button becomes **Done**.
2. Every widget gets a small control pill in its top-right corner:
   - A **grip** handle — drag it to reorder, or focus it and use the arrow keys (works for keyboard users who can't drag).
   - A **width stepper** (only if the widget supports more than one width) — narrower/wider between **Cell**, **Wide** and **Full**.
   - A **height stepper** (only if the widget supports more than one height) — shorter/taller, in half-card steps.
   - A **settings gear** (configurable widgets only — see below) — opens that widget's own options.
   - A **remove** control — moves the widget to the shelf. Nothing is deleted; you can add it back any time.
3. To add a widget, use the **Add a widget…** search box in the header — type to search, pick one, and it's added to the board immediately. Widgets you haven't added before are marked **New**.
4. Click **Pack** to let a later small widget slide up into a gap a taller one left behind, instead of leaving holes in the grid. Off by default, so your arrangement never silently reorders itself.
5. Click **Done** when you're finished. Every change during Customize mode saves itself as you make it — there's no separate save step.

Widgets are inert while you're customizing (clicking one won't navigate away) so you can rearrange without accidentally leaving the page.

## Configuring a widget

A few widgets (the DM screen card, roll-a-table, and the rule tracker) can show one of several things depending on which instance you want. Click the **settings gear** on that widget's control pill to choose what it displays. Changes apply immediately — there's no separate confirm step, and closing the settings panel just closes it.

## Resetting to default

Click **Reset to default** (next to the widget picker, while customizing). Your saved layout is discarded immediately and the board returns to the built-in Prep or At the table default — no confirmation dialog, but a toast appears with an **Undo** button if you didn't mean to.

## What's on the board by default

**Prep** ships with: **Needs prep**, **Quests**, **Next session**, **Unidentified**, **Party**, **Pinned notes**, **Campaign stats**.

**At the table** ships with: **Live encounter**, **Party**, **Quests**, **Session**, **Unidentified**, **Recent NPCs**, **Pinned notes**, **Campaign stats**.

## The full widget catalog

Everything else lives on the shelf — add it from **Add a widget…** if you want it on your board. Widgets marked **self-hiding** render nothing (and don't reserve space) until they have something to show.

| Widget | What it shows |
| --- | --- |
| Needs prep | Quests and encounters not ready to run, plus undelivered loot |
| Quests | One row per active/paused/in-play quest, merged from every stage |
| Next session | Countdown to your table's next agreed session date |
| Unidentified | Party items still awaiting identification |
| Party | HP, AC, conditions and passive scores for the roster, with online presence dots |
| Recent NPCs | Up to 10 NPCs you've visited recently, in visit order |
| Pinned notes | Your pinned campaign notes (up to 4) |
| Live encounter | A banner for whichever encounter is currently running combat |
| Campaign stats | Row of campaign totals with links, no card chrome |
| Session | In-world game day and current location, with a sync-to-party control |
| DM screen card _(configurable)_ | One reference table from the DM Screen, your choice |
| Roll a table _(configurable)_ | Rolls one of your saved roll tables in place |
| Conditions | All 16 conditions, rules text one tap away |
| Monster quick-pull | A random monster by CR band and creature type, for improvising |
| Quest triggers due | Scheduled quest consequences about to fire |
| Players wrote _(self-hiding)_ | Shared player journal entries you haven't read yet |
| Initiative _(self-hiding)_ | Round, current turn and every combatant's HP, while combat runs |
| Encounters needing prep | Encounters missing combatants, a location or a reward |
| Shops needing stock | Store locations with no stock, or stock nobody can see |
| Recently discovered monsters _(self-hiding)_ | Monsters your party has recently met, mirroring Recent NPCs |
| Ambience _(self-hiding)_ | Jumps straight to a named soundboard page |
| Rules search | Search the compendium from the board |
| Cursed items _(self-hiding)_ | Loot whose curse hasn't been revealed yet |
| Recent quest activity | The beat-by-beat feed of what's happened in your quests |
| Deities _(self-hiding)_ | Your pantheon's domains, alignment and symbols |
| Rule tracker _(configurable)_ | A homebrew rule's stateful tracker (Sanity, Corruption, etc.), live for the party |
| Jump to… | Global search, embedded as a card |
| Quick create | Five links to blank NPC/quest/note/encounter/location forms |
| Upcoming events | The next few in-world calendar events, with countdowns |
| Unclaimed loot | Loot you've prepared but not dropped, and loot the party hasn't claimed |
| Downtime queue | Pending downtime draws awaiting your resolution |
| Table vitals | Spell slots, class resources and concentration across the party |
| Death saves _(self-hiding)_ | Anyone at 0 HP, until they stabilize or die |
| Dice roller | Seven standard dice plus a free expression field, with advantage/disadvantage |
| Last session | The most recent session note, one tap away |

## What your players see

Nothing. The Dashboard is DM-only — there's no player-facing equivalent, and none of its widgets are reachable from the Player Portal.

## Tips

> Rearranging costs nothing to try: every widget you remove goes to the shelf, not the trash, so there's no wrong move while customizing.

- A widget that offers only one width or height simply has no stepper for that dimension — that isn't a bug, it means the card only makes sense at one size.
- Self-hiding widgets are worth adding even if your table doesn't need them yet (Death Saves, Cursed Items, Deities) — they cost nothing on a quiet night and appear the moment they're relevant.
- The board you arrange is per campaign, so switching campaigns can show you a different layout entirely.

## Related

- [Running a Session](#running-a-session) — what flips the dashboard from Prep to At the table.
- [Campaign Notes](#campaign-notes) — where Pinned notes and Last session come from.
- [Party Tracker](#party-tracker) — the detail view behind the Party and Table vitals widgets.
- [Quest Log](#quest-log) — the detail view behind the Quests widget.
