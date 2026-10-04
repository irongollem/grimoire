import { describe, expect, it } from "vitest";
import {
  buildCalendarEventConstraints,
  formatEventDateLabel,
  normalizeCalendarEventResult,
  CALENDAR_AI_EVENT_TYPES,
} from "./eventGeneration";

describe("buildCalendarEventConstraints", () => {
  it("lists date, kind, deities and factions", () => {
    const lines = buildCalendarEventConstraints({
      dateLabel: "3 Mirtul, 1492",
      eventType: "festival",
      deities: [{ name: "Lathander", domains: ["dawn", "renewal"] }],
      pantheons: [{ name: "Faerunian" }],
      factions: [{ name: "Harpers", faction_type: "spies" }],
    });
    expect(lines[0]).toBe("Date: 3 Mirtul, 1492");
    expect(lines[1]).toContain("festival");
    expect(lines).toContain("Deities: Lathander (dawn, renewal)");
    expect(lines).toContain("Pantheons: Faerunian");
    expect(lines).toContain("Factions: Harpers (spies)");
  });

  it("stays within the edge limits", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `Deity ${"x".repeat(80)} ${i}` }));
    const lines = buildCalendarEventConstraints({
      dateLabel: "1 A, 1",
      eventType: "campaign",
      deities: many,
      pantheons: many,
      factions: many,
    });
    expect(lines.length).toBeLessThanOrEqual(12);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(400);
  });

  it("omits empty sections", () => {
    const lines = buildCalendarEventConstraints({
      dateLabel: "",
      eventType: "world",
      deities: [],
      pantheons: [],
      factions: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("world");
  });
});

describe("formatEventDateLabel", () => {
  it("formats regular and festival dates", () => {
    expect(formatEventDateLabel({ year: 1492, month: 3, day: 3, festivalDay: null, monthName: "Mirtul" })).toBe("3 Mirtul, 1492");
    expect(formatEventDateLabel({ year: 1492, month: null, day: null, festivalDay: "Midwinter", monthName: null })).toBe("Midwinter, 1492");
  });
});

describe("normalizeCalendarEventResult", () => {
  it("accepts a clean result", () => {
    expect(
      normalizeCalendarEventResult({ title: " Harvest ", event_type: "Festival", description: " Text " }, CALENDAR_AI_EVENT_TYPES, "campaign"),
    ).toEqual({ title: "Harvest", event_type: "festival", description: "Text" });
  });
  it("falls back to the selected type for an unknown type", () => {
    expect(normalizeCalendarEventResult({ title: "A", event_type: "banquet", description: "" }, CALENDAR_AI_EVENT_TYPES, "world").event_type).toBe("world");
  });
  it("throws on an empty title", () => {
    expect(() => normalizeCalendarEventResult({ title: "  ", description: "x" }, CALENDAR_AI_EVENT_TYPES, "world")).toThrow();
    expect(() => normalizeCalendarEventResult({ title: 4 }, CALENDAR_AI_EVENT_TYPES, "world")).toThrow();
  });
  it("ignores non-string descriptions", () => {
    expect(normalizeCalendarEventResult({ title: "A", description: 5 }, CALENDAR_AI_EVENT_TYPES, "world").description).toBe("");
  });
});
