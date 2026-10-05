import { describe, expect, it } from "vitest";
import type { CalendarAdapter, CalendarEvent } from "@/types/calendar.types";
import { upcomingEvents, weekContainingToday } from "./calendarWeek";

const TENDAY: CalendarAdapter = {
  id: "t",
  name: "T",
  epochName: "TE",
  defaultYear: 1000,
  months: [
    { num: 1, name: "First", days: 30 },
    { num: 2, name: "Second", days: 30 },
  ],
  intercalaryDays: [{ name: "Founding Day", afterMonth: 1, description: "" }],
  weekSize: 10,
  weekRowNames: ["First Tenday"],
  isLeapYear: () => false,
  formatDate: () => "",
};

// 31-day month starting on weekday index 5 (Saturday-ish) in a 7-day week.
const WEEKS: CalendarAdapter = {
  ...TENDAY,
  months: [{ num: 1, name: "Jan", days: 31 }],
  intercalaryDays: [],
  weekSize: 7,
  weekRowNames: undefined,
  weekdayOffset: () => 5,
};

let id = 0;
function ev(o: Partial<CalendarEvent>): CalendarEvent {
  id += 1;
  return {
    id: `e${id}`,
    user_id: "u",
    campaign_id: "c",
    title: `E${id}`,
    description: null,
    event_type: "session",
    harptos_year: 1000,
    harptos_month: 1,
    harptos_day: 1,
    festival_day: null,
    is_multi_day: false,
    end_year: null,
    end_month: null,
    end_day: null,
    color: "#000",
    linked_quest_id: null,
    linked_encounter_id: null,
    linked_location_id: null,
    linked_note_id: null,
    travel_party_member_ids: [],
    player_visible: true,
    created_at: "",
    updated_at: "",
    ...o,
  } as CalendarEvent;
}

describe("weekContainingToday", () => {
  it("returns the tenday row with its name and marks today and events", () => {
    const w = weekContainingToday(TENDAY, { year: 1000, month: 1, day: 4 }, [ev({ harptos_day: 7 })]);
    expect(w?.label).toBe("First Tenday");
    expect(w?.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(w?.days.find((d) => d.isToday)?.day).toBe(4);
    expect(w?.days.filter((d) => d.hasEvent).map((d) => d.day)).toEqual([7]);
  });

  it("falls back to 'Tenday N' beyond named rows", () => {
    const w = weekContainingToday(TENDAY, { year: 1000, month: 1, day: 25 }, []);
    expect(w?.label).toBe("Tenday 3");
    expect(w?.days[0].day).toBe(21);
  });

  it("clips a short first row by the weekday offset", () => {
    const w = weekContainingToday(WEEKS, { year: 1000, month: 1, day: 2 }, []);
    expect(w?.label).toBe("Week 1");
    expect(w?.days.map((d) => d.day)).toEqual([1, 2]);
  });

  it("clips a short last row at month end", () => {
    const w = weekContainingToday(WEEKS, { year: 1000, month: 1, day: 31 }, []);
    expect(w?.days.map((d) => d.day)).toEqual([31]);
    expect(w?.label).toBe("Week 6");
  });

  it("covers multi-day events and ignores other years and festivals", () => {
    const events = [
      ev({ harptos_day: 2, is_multi_day: true, end_day: 4 }),
      ev({ harptos_year: 999, harptos_day: 9 }),
      ev({ harptos_month: null, harptos_day: null, festival_day: "Founding Day" }),
    ];
    const w = weekContainingToday(TENDAY, { year: 1000, month: 1, day: 1 }, events);
    expect(w?.days.filter((d) => d.hasEvent).map((d) => d.day)).toEqual([2, 3, 4]);
  });

  it("is null for a month the adapter lacks", () => {
    expect(weekContainingToday(TENDAY, { year: 1000, month: 9, day: 1 }, [])).toBeNull();
  });
});

describe("upcomingEvents", () => {
  it("returns the next N, soonest first, skipping past and unplaceable events", () => {
    const events = [
      ev({ title: "past", harptos_day: 1 }),
      ev({ title: "later", harptos_month: 2, harptos_day: 3 }),
      ev({ title: "soon", harptos_day: 12 }),
      ev({ title: "no date", harptos_month: null, harptos_day: null }),
      ev({ title: "festival", harptos_month: null, harptos_day: null, festival_day: "Founding Day" }),
    ];
    const out = upcomingEvents(events, TENDAY, { year: 1000, month: 1, day: 5 }, 2);
    expect(out.map((o) => o.event.title)).toEqual(["soon", "festival"]);
    expect(out[0].daysUntil).toBe(7);
  });
});
