import { describe, expect, it } from "vitest";
import {
  routeDescription,
  routeEventPrefill,
  routeTitle,
  summarizeRoute,
  type RoutePoint,
} from "@/lib/locations/mapRoute";
import type { CalendarAdapter } from "@/types/calendar.types";
import type { MapScale } from "@/types/location.types";

const SIZE = { width: 2000, height: 1000 };
// 1000 natural pixels = 100 mi, so a 0.5-wide hop is 100 mi.
const SCALE: MapScale = { unit: "mi", distance: 100, a: { x: 0.1, y: 0.5 }, b: { x: 0.6, y: 0.5 } };

const ADAPTER: CalendarAdapter = {
  id: "test",
  name: "Test",
  epochName: "TE",
  defaultYear: 1000,
  months: [
    { num: 1, name: "First", days: 30 },
    { num: 2, name: "Second", days: 30 },
  ],
  intercalaryDays: [],
  weekSize: 10,
  isLeapYear: () => false,
  formatDate: () => "",
};

const START = { year: 1495, month: 1, day: 29 };

function route(dx: number, from?: string, to?: string): RoutePoint[] {
  return [
    { x: 0, y: 0, pin: from ? { id: "loc-a", name: from } : null },
    { x: dx, y: 0, pin: to ? { id: "loc-b", name: to } : null },
  ];
}

describe("summarizeRoute", () => {
  it("needs two waypoints", () => {
    expect(summarizeRoute([], SCALE, SIZE, "normal")).toBeNull();
    expect(summarizeRoute(route(0.5).slice(0, 1), SCALE, SIZE, "normal")).toBeNull();
  });

  it("is null while the image size is unknown", () => {
    expect(summarizeRoute(route(0.5), SCALE, { width: 0, height: 0 }, "normal")).toBeNull();
  });

  it("measures distance and time at the pace", () => {
    const s = summarizeRoute(route(0.42, "Waterdeep", "Daggerford"), SCALE, SIZE, "normal")!;
    expect(s.distance).toBeCloseTo(84, 6);
    expect(s.time).toMatchObject({ days: 3, hours: 4, calendarDays: 4 });
    expect(s.from?.name).toBe("Waterdeep");
    expect(s.to?.name).toBe("Daggerford");
  });
});

describe("route text", () => {
  it("names both ends when both are pins", () => {
    const s = summarizeRoute(route(0.42, "Waterdeep", "Daggerford"), SCALE, SIZE, "normal")!;
    expect(routeTitle(s)).toBe("Travel to Daggerford");
    expect(routeDescription(s)).toBe("84 mi from Waterdeep to Daggerford at a normal pace: 3 days, 4 hours.");
  });

  it("says only what it knows when an end is open ground", () => {
    const s = summarizeRoute(route(0.42), SCALE, SIZE, "fast")!;
    expect(routeTitle(s)).toBe("Travel");
    expect(routeDescription(s)).toBe("84 mi at a fast pace: 2 days, 7 hours.");
    const onlyTo = summarizeRoute(route(0.42, undefined, "Daggerford"), SCALE, SIZE, "slow")!;
    expect(routeDescription(onlyTo)).toMatch(/^84 mi to Daggerford at a slow pace/);
  });
});

describe("routeEventPrefill", () => {
  it("spans every calendar day a longer trip touches", () => {
    const s = summarizeRoute(route(0.42, "Waterdeep", "Daggerford"), SCALE, SIZE, "normal")!;
    // 4 calendar days from the 29th of month 1: 29, 30, then 1st and 2nd of month 2.
    const p = routeEventPrefill(s, START, ADAPTER, ["pm-1"]);
    expect(p).toMatchObject({
      title: "Travel to Daggerford",
      event_type: "travel",
      harptos_year: 1495,
      harptos_month: 1,
      harptos_day: 29,
      is_multi_day: true,
      end_year: 1495,
      end_month: 2,
      end_day: 2,
      linked_location_id: "loc-b",
      travel_party_member_ids: ["pm-1"],
    });
  });

  it("keeps a trip of a day or less to a single day", () => {
    const s = summarizeRoute(route(0.12, "A", "B"), SCALE, SIZE, "normal")!; // 24 mi: exactly one day
    const p = routeEventPrefill(s, START, ADAPTER, []);
    expect(p).toMatchObject({ is_multi_day: false, end_year: null, end_month: null, end_day: null });
  });

  it("links no location when the route ends on open ground", () => {
    const s = summarizeRoute(route(0.1), SCALE, SIZE, "normal")!;
    expect(routeEventPrefill(s, START, ADAPTER, []).linked_location_id).toBeNull();
  });
});
