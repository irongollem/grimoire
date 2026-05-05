---
title: Calendar System
section: World Building
section_order: 3
order: 3
summary: Track in-world dates, seasons, and events using one of 10 calendar adapters.
keywords: calendar, event, date, harptos, faerun, timeline, session, festival, travel
---

## Calendar adapters

Grimoire ships with calendar adapters for 10 D&D settings. Select yours in **Campaign Settings → Details**:

- Faerûn (Harptos) — 12 months of 30 days, split into three 10-day tendays, plus 5–6 intercalary festival days.
- Eberron, Greyhawk, Dragonlance, Ravenloft, Planescape, Spelljammer, Dark Sun, Mystara, Gregorian.

Each adapter knows the month names, day counts, festival days, and how to display dates in the correct format.

## Grid view and Timeline view

The Calendar has two display modes:

**Grid view** — one month at a time, each day as a cell. Festival/intercalary days appear as special rows between months (Harptos only). Click a day to add an event.

**Timeline view** — a horizontal timeline spanning 1, 3, or 10 years. Events appear as coloured lanes. The timeline algorithm stacks overlapping events to avoid visual collisions.

## Event types and colours

| Type         | Typical use                                    |
| ------------ | ---------------------------------------------- |
| Campaign     | Major story beats                              |
| World        | In-world historic events                       |
| Session      | Marks which real-world date a session happened |
| Festival     | Recurring holidays                             |
| Deadline     | Time-sensitive quest elements                  |
| Player Death | Commemorates fallen characters                 |
| Boss Fight   | Marks significant combat encounters            |
| Discovery    | Lore reveals, map finds                        |
| NPC Death    | Important NPC deaths                           |
| Travel       | Party movement between locations               |
| Quest        | Quest start/completion points                  |
| Encounter    | Notable combat events                          |
| Location     | Arrival at a new location                      |
| Custom       | Anything else                                  |

Each type has a distinct colour across both views.

## Creating an event

Click any day in the Grid view or the **New Event** button. Fill in:

- **Title** — required.
- **Date** — year, month, day (pre-filled from your click).
- **Type** — pick from the list above.
- **Description** — rich text.
- **Player visible** toggle — players see this event in their calendar if enabled.

**Travel events** are special — linking a travel event to the party's destination automatically updates the party members' `current_location` at that in-world date.

## Populate setting bundle

Click **Populate Setting Bundle** to seed pre-authored holiday and recurring events for your world (e.g. Midwinter, Shieldmeet, and other Faerûn festivals for Harptos). The import is idempotent.

## Linking events to other entities

Quests, encounters, and locations all have a **Calendar** section where you can pin specific in-world dates. These linked events appear on the main calendar too.

## Advancing the current date

The **Today** marker on the calendar reflects `current_year` from your campaign settings. Moving Today forward (editing the campaign settings date) can trigger Quest Consequence triggers that have date-based offsets — Grimoire fires any pending triggers automatically when the date advances past them.
