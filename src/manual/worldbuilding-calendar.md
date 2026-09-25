---
title: Calendar System
section: World Building
section_order: 2
order: 4
summary: Track in-world dates, seasons, sessions and events on a month grid or a zoomable chronicle timeline, using one of ten built-in calendars or your own.
keywords: calendar, event, date, harptos, faerun, timeline, chronicle, session, festival, travel
---

The Calendar tracks your campaign's in-world dates (festivals, session markers, deadlines, travel) on a month grid or a long zoomable timeline. Find it under **Campaign → Calendar** in the sidebar (`/calendar`).

## Key ideas

| Term | Meaning |
| --- | --- |
| Calendar adapter | The month names, day counts, festival days and display format for one setting. Ten ship built-in; you can also define a fully custom one. |
| Month view | One month at a time, laid out as a grid of days. |
| Chronicle view | A horizontal, zoomable timeline of events across years. |
| Today | The campaign's current in-world date: advancing it can fire date-based quest consequences. |

## Choosing a calendar

Pick your adapter in **Campaign Settings → Details**, under **Calendar**: Faerûn (Calendar of Harptos), Eberron, Greyhawk, Dragonlance, Ravenloft, Planescape, Spelljammer, Dark Sun, Mystara, or Gregorian: nine D&D settings plus the real-world calendar. Faerûn's Harptos calendar is 12 months of 30 days, grouped into three 10-day tendays, plus 5–6 intercalary festival days a year (a sixth, Shieldmeet, only on leap years) that sit between months rather than inside them. Each adapter knows its own month names, day counts, festival days and date format.

Pick **Custom calendar…** instead to build your own from scratch with the calendar editor that appears beneath the picker: your own month names, lengths and festival days.

## Month view and Chronicle view

Toggle between the two with the **Month** / **Chronicle** control in the top-right:

- **Month**: one month at a time, one cell per day. Festival days appear as their own rows between months (Harptos only). Click any day to add an event there, or an existing event to edit it.
- **Chronicle**: a horizontal timeline. A **ZOOM** row of preset buttons (1wk, 1mo, 1yr, 10yr, 20yr, 50yr, 100yr) sets how much time is visible at once; ← / → step by that same span, and a year box jumps straight to a given year. Overlapping events stack into separate lanes automatically so nothing overlaps.

## Event types and colours

| Type         | Typical use                                    |
| ------------ | ----------------------------------------------- |
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

Each type has a distinct colour across both views, picked automatically from the type: there's no separate colour field to set.

## Creating an event

Click a day in Month view, or the **Event** button anywhere. Fill in:

- **Title**: required.
- A type, from the picker described above.
- A **date**: pick a regular month/day, or switch to a **festival day** for one of the calendar's own intercalary days. Toggle **multi-day** to add an end date and span the event across a range.
- **Description** (rich text, optional).
- **Visible to players**: sharing an event that wasn't already shared also drops a chat announcement naming it.

**Travel events** show two extra fields (a **location** and the **party members** travelling) and saving the event immediately moves those party members' current location to match. This is the one place a calendar event has a side effect outside the calendar itself.

An event created by pinning a calendar section on a quest, encounter or location (see below) shows a read-only "Pinned `<type>`" chip with an **Open →** link back to that entity instead of the travel fields.

A **session** event linked to one of your session notes opens as a read-only summary instead of the edit form: its session number, real-world date, tags and content, with an **Open in Notes →** link.

## Populate Setting Events

Click **Setting Events** (shown only when your active calendar has a matching bundle) to import pre-authored holidays and recurring events for your world: Midwinter, Shieldmeet and the rest of Harptos's own festivals, for Faerûn. Review the list in the dialog and click **Import All N Events**.

## Linking events to other entities

Quests, encounters, and locations all have a **Calendar** section on their own pages where you can pin specific in-world dates: these appear on the main calendar too, shown as pinned entities rather than editable events.

## Advancing the current date

The **Today** chip in the top-right shows the in-world date and opens an inline editor (Month / Day / Year) when clicked: **Set Today** commits it. Moving Today forward can trigger any pending date-based Quest Consequence triggers, which fire automatically once the date advances past them.

## What your players see

Players see a read-only calendar in the Player Portal at **Calendar**, showing only events marked **Visible to players**, the same month/chronicle toggle, without the ability to create or edit anything.

## Tips

> Multi-day and festival dates are mutually exclusive on one event: switching to a festival day clears the regular month/day fields, and vice versa.

- A travel event is the one type that changes data outside the calendar (party position) the moment you save it: double-check the party member list before confirming.
- Sharing an event for the first time posts an in-chat announcement; toggling it back off does not retract that message.

## Related

- [Atlas: Locations](#atlas-locations)
- [Campaign Settings](#campaign-settings)
- [Quest Log](#quest-log)
