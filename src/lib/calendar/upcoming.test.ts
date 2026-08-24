import { describe, it, expect } from "vitest";
import type { CalendarAdapter, CalendarEvent, CalendarEventType } from "@/types/calendar.types";
import { nextUpcomingEvents, formatDaysUntil, type CalendarToday } from "./upcoming";

/**
 * A small, self-contained adapter rather than the real Faerûn one: three
 * 30-day months keeps the arithmetic checkable by hand, and two intercalary
 * days sharing an `afterMonth` (plus one `isLeapOnly`) is enough to exercise
 * every branch `buildYearIndex` has without dragging in `settings/faerun.ts`'s
 * full twelve months. Non-leap year length: 30*3 + 2 = 92. Leap year: 93.
 */
const TEST_ADAPTER: CalendarAdapter = {
  id: "test",
  name: "Test Calendar",
  epochName: "TE",
  defaultYear: 1000,
  months: [
    { num: 1, name: "First", days: 30 },
    { num: 2, name: "Second", days: 30 },
    { num: 3, name: "Third", days: 30 },
  ],
  intercalaryDays: [
    { name: "Founding Day", afterMonth: 1, description: "First of two after month 1" },
    { name: "Midyear", afterMonth: 1, description: "Second of two after month 1" },
    { name: "Leap Day", afterMonth: 2, description: "Only in a leap year", isLeapOnly: true },
  ],
  weekSize: 10,
  isLeapYear: (year) => year % 4 === 0, // 2000 and 2004 are leap; 2001-2003 are not
  formatDate: (year, month, day, festivalDay) =>
    festivalDay ? `${festivalDay} ${year}` : `${month}/${day}/${year}`,
};

function today(year: number, month: number, day: number): CalendarToday {
  return { year, month, day };
}

let nextId = 0;
function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  nextId += 1;
  return {
    id: `event-${nextId}`,
    user_id: "user-1",
    campaign_id: "campaign-1",
    title: `Event ${nextId}`,
    description: null,
    event_type: "campaign",
    harptos_year: 2001,
    harptos_month: 1,
    harptos_day: 1,
    festival_day: null,
    is_multi_day: false,
    end_year: null,
    end_month: null,
    end_day: null,
    color: "#000000",
    linked_quest_id: null,
    linked_encounter_id: null,
    linked_location_id: null,
    linked_note_id: null,
    travel_party_member_ids: [],
    player_visible: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("nextUpcomingEvents", () => {
  it("includes an event dated today, with a countdown of 0", () => {
    const event = makeEvent({ harptos_year: 2001, harptos_month: 1, harptos_day: 15 });
    const result = nextUpcomingEvents([event], TEST_ADAPTER, today(2001, 1, 15), { limit: 5 });
    expect(result).toEqual([{ event, daysUntil: 0 }]);
  });

  it("excludes an event in the past", () => {
    const event = makeEvent({ harptos_year: 2001, harptos_month: 1, harptos_day: 10 });
    const result = nextUpcomingEvents([event], TEST_ADAPTER, today(2001, 1, 15), { limit: 5 });
    expect(result).toEqual([]);
  });

  it("orders events across a year boundary by true distance, not by month number", () => {
    // Today is near the end of year 2001 (a 92-day year here). An event 5 days
    // later, still in 2001, must sort *before* an event that is nominally
    // "month 1" but actually 7 days away in 2002 — the naive bug this test
    // exists to catch would instead sort month 1 before month 3 regardless of
    // year, putting the 2002 event first.
    const soonThisYear = makeEvent({ harptos_year: 2001, harptos_month: 3, harptos_day: 30 });
    const laterNextYear = makeEvent({ harptos_year: 2002, harptos_month: 1, harptos_day: 2 });
    const result = nextUpcomingEvents(
      [laterNextYear, soonThisYear],
      TEST_ADAPTER,
      today(2001, 3, 25),
      { limit: 5 },
    );
    expect(result).toEqual([
      { event: soonThisYear, daysUntil: 5 },
      { event: laterNextYear, daysUntil: 7 },
    ]);
  });

  it("places two intercalary days sharing an afterMonth in the adapter's own order", () => {
    const midyear = makeEvent({ harptos_year: 2001, harptos_month: null, harptos_day: null, festival_day: "Midyear" });
    const founding = makeEvent({ harptos_year: 2001, harptos_month: null, harptos_day: null, festival_day: "Founding Day" });
    const result = nextUpcomingEvents([midyear, founding], TEST_ADAPTER, today(2001, 1, 1), { limit: 5 });
    // Founding Day is declared first in TEST_ADAPTER.intercalaryDays, so it
    // falls on the day right after month 1, and Midyear the day after that.
    expect(result).toEqual([
      { event: founding, daysUntil: 30 },
      { event: midyear, daysUntil: 31 },
    ]);
  });

  it("includes a leap-only festival with the right countdown in a year that has it", () => {
    const leapDay = makeEvent({ harptos_year: 2000, harptos_month: null, harptos_day: null, festival_day: "Leap Day" });
    const result = nextUpcomingEvents([leapDay], TEST_ADAPTER, today(2000, 1, 1), { limit: 5 });
    expect(result).toEqual([{ event: leapDay, daysUntil: 62 }]);
  });

  it("silently drops a leap-only festival in a year that doesn't have it, rather than crashing", () => {
    const leapDay = makeEvent({ harptos_year: 2001, harptos_month: null, harptos_day: null, festival_day: "Leap Day" });
    const result = nextUpcomingEvents([leapDay], TEST_ADAPTER, today(2001, 1, 1), { limit: 5 });
    expect(result).toEqual([]);
  });

  it("returns nothing when the type filter matches no event", () => {
    const event = makeEvent({ event_type: "campaign", harptos_year: 2001, harptos_month: 1, harptos_day: 20 });
    const result = nextUpcomingEvents([event], TEST_ADAPTER, today(2001, 1, 15), {
      limit: 5,
      eventTypes: ["quest"],
    });
    expect(result).toEqual([]);
  });

  it("keeps only events matching a multi-type filter", () => {
    const deadline = makeEvent({ event_type: "deadline", harptos_month: 1, harptos_day: 20 });
    const festival = makeEvent({ event_type: "festival", harptos_month: 1, harptos_day: 21 });
    const travel = makeEvent({ event_type: "travel", harptos_month: 1, harptos_day: 22 });
    const eventTypes: CalendarEventType[] = ["deadline", "festival"];
    const result = nextUpcomingEvents([deadline, festival, travel], TEST_ADAPTER, today(2001, 1, 15), {
      limit: 5,
      eventTypes,
    });
    expect(result.map((r) => r.event)).toEqual([deadline, festival]);
  });

  it("caps the result at limit, keeping the earliest events", () => {
    const events = [1, 2, 3, 4, 5].map((day) =>
      makeEvent({ harptos_year: 2001, harptos_month: 1, harptos_day: 15 + day }),
    );
    const result = nextUpcomingEvents(events, TEST_ADAPTER, today(2001, 1, 15), { limit: 2 });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.daysUntil)).toEqual([1, 2]);
  });
});

describe("formatDaysUntil", () => {
  it.each([
    [0, "Today"],
    [1, "Tomorrow"],
    [6, "In 6 days"],
    [30, "In 30 days"],
  ])("formats %i days as %s", (daysUntil, expected) => {
    expect(formatDaysUntil(daysUntil)).toBe(expected);
  });
});
