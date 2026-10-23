import { describe, expect, it } from "vitest";
import type { OpenBookEvent, OpenBookPlace, OpenBookSession } from "@/types/openBook.types";
import { getCalendarAdapter } from "@/settings";
import {
  festivalsOf,
  formatCalendarDate,
  countLabel,
  formatPlayedOn,
  humanize,
  markedDays,
  monthGrid,
  monthRange,
  placePlate,
  pluralize,
  readPins,
  romanNumeral,
  sessionRubric,
  splitLeadImage,
  standingOf,
  statusLabel,
  stepMonth,
} from "./articleData";

const place = (extra: Partial<OpenBookPlace>): OpenBookPlace => ({
  id: "p",
  parent_id: null,
  name: "P",
  location_type: null,
  player_summary: null,
  description: null,
  image_url: null,
  tags: null,
  is_level: null,
  is_battle_map: null,
  npcs_shared: null,
  map: null,
  pins: [],
  ...extra,
});

const event = (extra: Partial<OpenBookEvent>): OpenBookEvent => ({
  id: "e",
  title: "Feast",
  description: null,
  event_type: null,
  year: 1492,
  month: 1,
  day: 5,
  festival_day: null,
  is_multi_day: null,
  end_year: null,
  end_month: null,
  end_day: null,
  color: null,
  ...extra,
});

const session = (extra: Partial<OpenBookSession>): OpenBookSession => ({
  id: "s",
  title: "A session",
  content: null,
  tags: null,
  session: null,
  date: null,
  real_date: null,
  created_at: "2026-01-01",
  ...extra,
});

describe("words", () => {
  it("writes roman numerals and leaves what it cannot", () => {
    expect(romanNumeral(14)).toBe("XIV");
    expect(romanNumeral(1994)).toBe("MCMXCIV");
    expect(romanNumeral(0)).toBe("0");
  });

  it("humanizes stored keys", () => {
    expect(humanize("drowned_town")).toBe("Drowned town");
  });

  it("names a standing with its token, and nothing for an unknown word", () => {
    expect(standingOf("friendly")).toEqual({ label: "Friendly", token: "--relationship-friendly" });
    expect(standingOf("beloved")).toBeNull();
    expect(standingOf(null)).toBeNull();
  });

  it("says nothing for alive", () => {
    expect(statusLabel("alive")).toBeNull();
    expect(statusLabel("dead")).toBe("Dead");
    expect(statusLabel(null)).toBeNull();
  });

  it("numbers a session in roman", () => {
    expect(sessionRubric(session({ session: { number: 14, title: null, played_on: null } }))).toBe("Session XIV");
    expect(sessionRubric(session({}))).toBeNull();
  });

  it("formats a played-on date without a timezone shift", () => {
    expect(formatPlayedOn("2026-10-22")).toBe("22 Oct 2026");
    expect(formatPlayedOn("nope")).toBeNull();
    expect(formatPlayedOn(null)).toBeNull();
  });
});

describe("maps", () => {
  it("prefers the map, then its layer, then the place picture", () => {
    const map = { url: null, layer_url: "layer", layer_calibration: null, plan_size: null, scale: null };
    expect(placePlate(place({ map: { ...map, url: "map" } }))).toEqual({ url: "map", isMap: true });
    expect(placePlate(place({ map, image_url: "pic" }))).toEqual({ url: "layer", isMap: true });
    expect(placePlate(place({ image_url: "pic" }))).toEqual({ url: "pic", isMap: false });
    expect(placePlate(place({}))).toBeNull();
  });

  it("keeps readable, visible pins only", () => {
    const pins = readPins([
      { child_location_id: "a", child_name: "A", x: 0.5, y: 0.25, visible_to_players: true },
      { child_location_id: "b", child_name: "B", x: 0.5, y: 0.25, visible_to_players: false },
      { child_location_id: "c", child_name: "C", x: 4, y: 0.25 },
      { child_name: "D", x: 0.1, y: 0.1 },
    ]);
    expect(pins).toEqual([{ childId: "a", name: "A", x: 0.5, y: 0.25 }]);
  });
});

describe("calendar", () => {
  const faerun = getCalendarAdapter("faerun");

  it("formats an in-world date with month and epoch", () => {
    expect(formatCalendarDate({ year: 1492, month: 2, day: 3 }, faerun)).toBe(`3 ${faerun.months[1]!.name}, Year 1492 ${faerun.epochName}`);
    expect(formatCalendarDate({ year: 1492, month: null, day: null }, null)).toBe("Year 1492");
    expect(formatCalendarDate({ year: null, month: 1, day: 1 }, faerun)).toBeNull();
    expect(formatCalendarDate(null, faerun)).toBeNull();
  });

  it("steps across year ends", () => {
    const last = faerun.months.length;
    expect(stepMonth(faerun, { year: 1, month: last }, 1)).toEqual({ year: 2, month: 1 });
    expect(stepMonth(faerun, { year: 1, month: 1 }, -1)).toEqual({ year: 0, month: last });
  });

  it("marks events, spans and sessions on a month", () => {
    const view = { year: 1492, month: 1 };
    const marks = markedDays(
      faerun,
      view,
      [event({ day: 5 }), event({ id: "m", title: "Siege", day: 8, is_multi_day: true, end_year: 1492, end_month: 1, end_day: 10 })],
      [session({ id: "s1", session: { number: 3, title: null, played_on: null }, date: { year: 1492, month: 1, day: 5, end_year: null, end_month: null, end_day: null } })],
    );
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([5, 8, 9, 10]);
    expect(marks.get(5)).toEqual({ day: 5, titles: ["Feast", "Session 3"], sessionId: "s1" });
  });

  it("spans into later months", () => {
    const e = event({ day: 28, is_multi_day: true, end_month: 2, end_year: 1492, end_day: 2 });
    const second = markedDays(faerun, { year: 1492, month: 2 }, [e], []);
    expect([...second.keys()]).toEqual([1, 2]);
  });

  it("ranges over everything dated, today included", () => {
    const range = monthRange([event({ month: 3 })], [], { year: 1492, month: 6, day: 1 });
    expect(range).toEqual({ first: { year: 1492, month: 3 }, last: { year: 1492, month: 6 } });
    expect(monthRange([], [], { year: null, month: null, day: null })).toBeNull();
  });

  it("lays out a month grid from the calendar", () => {
    const grid = monthGrid(faerun, { year: 1492, month: 1 });
    expect(grid.days).toBe(faerun.months[0]!.days);
    expect(grid.columns).toHaveLength(grid.columnCount);
    expect(grid.columns[0]).toBe("1st");
  });

  it("finds a year's festival events", () => {
    expect(festivalsOf([event({ festival_day: "Midwinter", month: null, day: null })], 1492)).toHaveLength(1);
    expect(festivalsOf([event({})], 1492)).toHaveLength(0);
  });
});

describe("splitLeadImage", () => {
  const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const img = (src: string, alt?: string) => ({ type: "image", attrs: { src, alt } });
  const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });

  it("takes the first image out and returns it as the lead", () => {
    const out = splitLeadImage(doc(para("a"), img("https://x.test/1.png", "Climb"), img("https://x.test/2.png"), para("b")));
    expect(out.leadImage).toEqual({ src: "https://x.test/1.png", alt: "Climb" });
    expect(out.docWithoutIt).toEqual({
      type: "doc",
      content: [para("a"), img("https://x.test/2.png"), para("b")],
    });
  });

  it("finds an image inside a paragraph and drops the paragraph it emptied", () => {
    const out = splitLeadImage(doc({ type: "paragraph", content: [img("/a.png")] }, para("b")));
    expect(out.leadImage?.src).toBe("/a.png");
    expect(out.docWithoutIt).toEqual({ type: "doc", content: [para("b")] });
  });

  it("leaves a report with no image alone", () => {
    const out = splitLeadImage(doc(para("a")));
    expect(out.leadImage).toBeNull();
    expect(out.docWithoutIt).toEqual({ type: "doc", content: [para("a")] });
  });

  it("ignores an image whose source is not a web address", () => {
    expect(splitLeadImage(doc(img("javascript:alert(1)"))).leadImage).toBeNull();
  });

  it("handles no content", () => {
    expect(splitLeadImage(null)).toEqual({ leadImage: null, docWithoutIt: null });
  });
});

describe("countLabel", () => {
  it("agrees the noun with the count", () => {
    expect(countLabel(1, "tale")).toBe("1 tale");
    expect(countLabel(0, "tale")).toBe("0 tales");
    expect(countLabel(4, "tale")).toBe("4 tales");
    expect(countLabel(1, "person", "people")).toBe("1 person");
    expect(countLabel(2, "person", "people")).toBe("2 people");
    expect(pluralize(1, "faction")).toBe("faction");
    expect(pluralize(3, "faction")).toBe("factions");
  });
});
