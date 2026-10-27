import { describe, expect, it } from "vitest";
import type { OpenBookEvent, OpenBookPlace, OpenBookSession, OpenBookSnapshot } from "@/types/openBook.types";
import { calendarDefToAdapter, createDefaultCustomCalendarDef, getCalendarAdapter } from "@/settings";
import type { BookEntryRef } from "./bookModel";
import {
  calendarAdapterFor,
  placeTypeLabel,
  recordFor,
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

describe("recordFor", () => {
  const snapshot = {
    places: [{ id: "p" }], folk: [{ id: "f" }], factions: [{ id: "x" }], pantheons: [{ id: "n" }],
    deities: [{ id: "d" }], lore: [{ id: "l" }], sessions: [{ id: "s" }],
  } as OpenBookSnapshot;

  it.each([
    ["place", "p", "places"], ["person", "f", "folk"], ["faction", "x", "factions"], ["pantheon", "n", "pantheons"],
    ["deity", "d", "deities"], ["lore", "l", "lore"], ["session", "s", "sessions"],
  ] as const)("finds a %s in its own list of the snapshot", (kind, id, list) => {
    const entry = { kind, id } as BookEntryRef;
    expect(recordFor(snapshot, entry)).toEqual({ kind, record: snapshot[list][0] });
  });

  it("is null for an id the snapshot does not hold, and never reads another kind's list", () => {
    expect(recordFor(snapshot, { kind: "place", id: "f" } as BookEntryRef)).toBeNull();
    expect(recordFor(snapshot, { kind: "lore", id: "nope" } as BookEntryRef)).toBeNull();
  });
});

describe("words", () => {
  it("writes roman numerals and leaves what it cannot", () => {
    expect(romanNumeral(14)).toBe("XIV");
    expect(romanNumeral(1994)).toBe("MCMXCIV");
    expect(romanNumeral(0)).toBe("0");
  });

  it("writes numerals up to 3999 and the plain number beyond, or for what is not a whole number", () => {
    expect(romanNumeral(3999)).toBe("MMMCMXCIX");
    expect(romanNumeral(4000)).toBe("4000");
    expect(romanNumeral(2.5)).toBe("2.5");
    expect(romanNumeral(-3)).toBe("-3");
  });

  it("labels a place type by its known name, else humanizes the stored key, and says nothing for none", () => {
    expect(placeTypeLabel("city")).toBe("City");
    expect(placeTypeLabel("drowned_town")).toBe("Drowned town");
    expect(placeTypeLabel(null)).toBeNull();
    expect(placeTypeLabel("")).toBeNull();
  });

  it("humanizes stored keys", () => {
    expect(humanize("drowned_town")).toBe("Drowned town");
    expect(humanize("half-drowned__town")).toBe("Half drowned town");
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

  it("keeps pins on the map's edges (0 and 1) and drops those outside it or without a name", () => {
    const pin = (x: number, y: number, child_name: string | null = "A") => ({ child_location_id: "a", child_name, x, y });
    expect(readPins([pin(0, 1), pin(1, 0)]).map((p) => [p.x, p.y])).toEqual([[0, 1], [1, 0]]);
    expect(readPins([pin(-0.1, 0.5), pin(0.5, 1.1), pin(0.5, 0.5, ""), pin(0.5, 0.5, null)])).toEqual([]);
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

  it("reads a month on its own, and a bare year, from the date it is given", () => {
    expect(formatCalendarDate({ year: 1492, month: 2, day: null }, faerun)).toBe(`${faerun.months[1]!.name}, Year 1492 ${faerun.epochName}`);
    expect(formatCalendarDate({ year: 1492, month: null, day: 3 }, faerun)).toBe(`Year 1492 ${faerun.epochName}`);
  });

  it("builds the campaign's calendar: a known id, a custom definition, or none", () => {
    const current = { year: null, month: null, day: null };
    const custom = { ...createDefaultCustomCalendarDef(), name: "Mine" };
    expect(calendarAdapterFor({ calendar_id: "faerun", custom_calendar: null, current })?.id).toBe("faerun");
    expect(calendarAdapterFor({ calendar_id: "custom", custom_calendar: custom, current })?.name).toBe("Mine");
    expect(calendarAdapterFor({ calendar_id: null, custom_calendar: custom, current })?.name).toBe("Mine");
    expect(calendarAdapterFor({ calendar_id: null, custom_calendar: { not: "a calendar" }, current })).toBeNull();
    expect(calendarAdapterFor({ calendar_id: null, custom_calendar: null, current })).toBeNull();
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

  it("leaves out what falls outside the month or has no full date", () => {
    const view = { year: 1492, month: 2 };
    const last = faerun.months[1]!.days;
    const marks = markedDays(
      faerun,
      view,
      [
        event({ id: "undated", month: null, day: 5 }),
        event({ id: "no-day", day: null }),
        event({ id: "past", month: 1, day: 5 }),
        event({ id: "later", month: 3, day: 5 }),
        event({ id: "over", month: 2, day: last + 5 }),
        event({ id: "ended", month: 1, day: 28, is_multi_day: true, end_year: 1492, end_month: 1, end_day: 30 }),
      ],
      [
        session({ id: "s-other-month", date: { year: 1492, month: 3, day: 4, end_year: null, end_month: null, end_day: null } }),
        session({ id: "s-no-day", date: { year: 1492, month: 2, day: null, end_year: null, end_month: null, end_day: null } }),
      ],
    );
    expect([...marks.keys()]).toEqual([]);
  });

  it("clips a span that runs past the month's last day, and names a numberless session by its title", () => {
    const last = faerun.months[0]!.days;
    const marks = markedDays(
      faerun,
      { year: 1492, month: 1 },
      [event({ day: last - 1, is_multi_day: true, end_year: 1492, end_month: 2, end_day: 3 })],
      [session({ id: "t", title: "The Descent", date: { year: 1492, month: 1, day: 2, end_year: null, end_month: null, end_day: null } })],
    );
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([2, last - 1, last]);
    expect(marks.get(2)?.titles).toEqual(["The Descent"]);
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
    // a session dated before every event moves the first month back
    const early = session({ date: { year: 1491, month: 11, day: 2, end_year: null, end_month: null, end_day: null } });
    expect(monthRange([event({ month: 3 })], [early], { year: null, month: null, day: null })).toEqual({
      first: { year: 1491, month: 11 },
      last: { year: 1492, month: 3 },
    });
  });

  it("lays out a month grid from the calendar", () => {
    const grid = monthGrid(faerun, { year: 1492, month: 1 });
    expect(grid.days).toBe(faerun.months[0]!.days);
    expect(grid.columns).toHaveLength(grid.columnCount);
    expect(grid.columns[0]).toBe("1st");
  });

  it("starts the grid on the weekday the month begins, for a calendar that follows the real week", () => {
    const real = calendarDefToAdapter("custom", { ...createDefaultCustomCalendarDef(), weekStyle: "weekly-offset" });
    // 1 Oct 2026 is a Thursday; the grid starts on Monday, so three cells come first.
    expect(monthGrid(real, { year: 2026, month: 10 }).leading).toBe(3);
    expect(monthGrid(faerun, { year: 1492, month: 1 }).leading).toBe(0);
  });

  it("labels the columns with the calendar's weekday names, else numbers them 1st to 10th", () => {
    const weekly = calendarDefToAdapter("custom", createDefaultCustomCalendarDef());
    expect(monthGrid(weekly, { year: 1, month: 1 }).columns).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    // A tenday has ten columns; seven names cannot label them, so they are numbered.
    const tenday = calendarDefToAdapter("custom", { ...createDefaultCustomCalendarDef(), weekStyle: "tenday" });
    expect(monthGrid(tenday, { year: 1, month: 1 }).columns).toEqual(
      ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"],
    );
  });

  it("finds a year's festival events", () => {
    expect(festivalsOf([event({ festival_day: "Midwinter", month: null, day: null })], 1492)).toHaveLength(1);
    expect(festivalsOf([event({ festival_day: "Midwinter", month: null, day: null, year: 1491 })], 1492)).toHaveLength(0);
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

  it("ignores an image whose source is not a web address, and a protocol-relative one", () => {
    expect(splitLeadImage(doc(img("javascript:alert(1)"))).leadImage).toBeNull();
    expect(splitLeadImage(doc(img("//evil.test/x.png"))).leadImage).toBeNull();
  });

  it("gives a blank alt text as no alt, and leaves a document with no content list as it was", () => {
    expect(splitLeadImage(doc(img("/a.png", "   "))).leadImage).toEqual({ src: "/a.png", alt: null });
    const bare = JSON.stringify({ type: "doc" });
    expect(splitLeadImage(bare)).toEqual({ leadImage: null, docWithoutIt: { type: "doc" } });
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
