import { describe, expect, it } from "vitest";
import { almanac, chronicleExcerpt, chronicleItems } from "./canonChronicle";
import { canonEntry } from "@/test/canonEntry";
import type { CalendarEvent } from "@/types/calendar.types";
import type { CanonForceStep, CanonForceTick } from "@/types/canon.types";
import type { Note } from "@/types/notes.types";
import type { CampaignSession } from "@/types/session.types";

const session = (id: string, over: Partial<CampaignSession> = {}): CampaignSession => ({
  id, campaign_id: "c1", user_id: "u", number: null, title: null, played_on: "2026-11-01", started_at: null, ended_at: null,
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...over,
});
const note = (id: string, over: Partial<Note> = {}): Note => ({
  id, user_id: "u", campaign_id: "c1", title: `Note ${id}`, content: null, tags: [], session_id: null, is_pinned: false, player_visible_to: [],
  session_start_year: null, session_start_month: null, session_start_day: null, session_end_year: null, session_end_month: null,
  session_end_day: null, session_real_date: null, linked_calendar_event_id: null, sort_order: null,
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...over,
});
const tick = (id: string, over: Partial<CanonForceTick> = {}): CanonForceTick => ({
  id, user_id: "u", campaign_id: "c1", force_id: "f1", delta: 1, note: "", session_id: null, step_id: null,
  world_year: null, world_month: null, world_day: null, created_at: "2026-11-01T10:00:00Z", ...over,
});

const calEvent = (id: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, user_id: "u", campaign_id: "c1", title: `Event ${id}`, description: null, event_type: "world", year: 500, month: null, day: null,
  festival_day: null, is_multi_day: false, end_year: null, end_month: null, end_day: null, color: "#000", linked_quest_id: null,
  linked_encounter_id: null, linked_location_id: null, linked_note_id: null, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z",
  ...over,
} as CalendarEvent);

describe("chronicleItems", () => {
  // Bug caught: a note with no session listed as a chronicle entry (it is a DM's own note, kept off the Chronicle).
  it("lists a session's note, and never a note that is not linked to a session", () => {
    const items = chronicleItems([session("s1")], [note("n1", { session_id: "s1" }), note("loose")]);
    expect(items.map((i) => [i.session.id, i.note?.id])).toEqual([["s1", "n1"]]);
  });

  // Bug caught: a session with no note dropped, so the DM had nowhere to start its chronicle.
  it("keeps a session with no note as an entry still to write", () => {
    const items = chronicleItems([session("s1")], []);
    expect(items[0]!.note).toBeNull();
  });

  // Bug caught: the older of two linked notes shown, hiding what the DM wrote last.
  it("takes the newest note when two are linked to one session", () => {
    const items = chronicleItems([session("s1")], [
      note("old", { session_id: "s1", updated_at: "2026-11-01T10:00:00Z" }),
      note("new", { session_id: "s1", updated_at: "2026-11-05T10:00:00Z" }),
    ]);
    expect(items[0]!.note?.id).toBe("new");
  });

  // Bug caught: ordering by session number, which is only a label; the log's own order is when it was played.
  it("orders newest first by when it was played", () => {
    const items = chronicleItems([session("a", { number: 9, played_on: "2026-10-01" }), session("b", { number: 1, played_on: "2026-11-01" })], []);
    expect(items.map((i) => i.session.id)).toEqual(["b", "a"]);
  });
});

describe("almanac", () => {
  const forces = [canonEntry({ id: "f1", part: "force", title: "The Ferrymen" })];

  // Bug caught: lore, ticks and sessions sorted by kind instead of by the world's calendar.
  it("mixes lore, ticks and sessions in world-date order", () => {
    const items = chronicleItems([session("s1", { number: 14 })], [note("n1", { session_id: "s1", title: "The Toll", session_start_year: 512, session_start_month: 3 })]);
    const events = almanac({
      lore: [canonEntry({ id: "l1", part: "lore", title: "The roads are first spun", world_year: 460 })],
      forces,
      ticks: [tick("t1", { world_year: 511, note: "stop paying the toll" })],
      items,
    });
    expect(events.map((e) => [e.kind, e.title])).toEqual([
      ["lore", "The roads are first spun"],
      ["moving", "The Ferrymen: stop paying the toll"],
      ["session", "The Toll"],
    ]);
  });

  // Bug caught: undated sessions sorting first (year 0), or vanishing from the almanac.
  it("puts sessions with no world date last and keeps them", () => {
    const items = chronicleItems(
      [session("early", { played_on: "2026-10-01" }), session("late", { played_on: "2026-11-01" }), session("dated", { played_on: "2026-09-01" })],
      [note("n", { session_id: "dated", session_start_year: 3 })],
    );
    const events = almanac({ lore: [canonEntry({ id: "l", part: "lore", title: "L", world_year: 900 })], forces, ticks: [], items });
    expect(events.map((e) => e.key)).toEqual(["session:dated", "lore:l", "session:early", "session:late"]);
  });

  // Bug caught: undated lore or a tick with no world date pinned to year 0 at the top of the timeline.
  it("leaves out lore and ticks that carry no date in the world", () => {
    const events = almanac({ lore: [canonEntry({ id: "l", part: "lore", world_year: null })], forces, ticks: [tick("t")], items: [] });
    expect(events).toEqual([]);
  });

  // Bug caught: a tick of a force that was deleted crashing the timeline or showing as "undefined".
  it("skips a tick whose force is gone", () => {
    expect(almanac({ lore: [], forces: [], ticks: [tick("t", { world_year: 5 })], items: [] })).toEqual([]);
  });
});

describe("almanac with the Calendar's events", () => {
  const forces = [canonEntry({ id: "f1", part: "force", title: "The Ferrymen" })];
  const lore = [canonEntry({ id: "l1", part: "lore", title: "The roads are first spun", world_year: 460 })];
  const items = chronicleItems([session("s1")], [note("n1", { session_id: "s1", title: "The Toll", session_start_year: 512 })]);

  // Bug caught: a world event logged on the Calendar ("The harbour burns") missing from the almanac, or sorted by kind.
  it("puts a Calendar world event in date order between lore and a session, worded by its type", () => {
    const events = almanac({ lore, forces, ticks: [], items, calendarEvents: [calEvent("e1", { title: "The harbour burns", year: 490, month: 2, day: 3 })] });
    expect(events.map((e) => [e.kind, e.title, e.word])).toEqual([
      ["lore", "The roads are first spun", null],
      ["calendar", "The harbour burns", "World"],
      ["session", "The Toll", null],
    ]);
    expect(events[1]!.to).toEqual({ path: "/calendar", query: { year: "490", month: "2" } });
  });

  // Bug caught: every session listed twice, once from its note and once from the session event useNoteCalendarSync mirrors.
  it("leaves out a session-type Calendar event, because the note already makes the session an entry", () => {
    const events = almanac({ lore: [], forces, ticks: [], items, calendarEvents: [calEvent("mirror", { event_type: "session", title: "The Toll", year: 512 })] });
    expect(events.map((e) => e.key)).toEqual(["session:s1"]);
  });

  // Bug caught: a year-only Calendar event given a month, so its link opened the wrong page of the Calendar.
  it("links a year-only event to its year alone", () => {
    const [event] = almanac({ lore: [], forces, ticks: [], items: [], calendarEvents: [calEvent("e", { year: 300 })] });
    expect(event!.to).toEqual({ path: "/calendar", query: { year: "300" } });
  });

  // Bug caught: undated lore still pinned to year 0 once Calendar events were added to the merge.
  it("still leaves out undated lore", () => {
    const events = almanac({ lore: [canonEntry({ id: "u", part: "lore", world_year: null })], forces, ticks: [], items: [], calendarEvents: [calEvent("e", { year: 300 })] });
    expect(events.map((e) => e.key)).toEqual(["calendar:e"]);
  });
});

describe("excerpt", () => {
  const doc = (...content: object[]) => JSON.stringify({ type: "doc", content });

  // Bug caught: the raw Tiptap JSON shown as the excerpt.
  it("reads the words of a note and cuts a long one at a word", () => {
    const long = Array.from({ length: 80 }, () => "word").join(" ");
    const excerpt = chronicleExcerpt(doc({ type: "paragraph", content: [{ type: "text", text: long }] }), 50);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(51);
    expect(excerpt).not.toContain("{");
  });
});

describe("almanac: steps that are due", () => {
  const dueStep = (over: Partial<CanonForceStep> = {}): CanonForceStep => ({
    id: "s1", user_id: "u", campaign_id: "c1", force_id: "f1", title: "The ferry stops", sort_order: 0, reached_at: null, reached_session_id: null,
    due_year: 512, due_month: null, due_day: null, ai_provenance: null, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...over,
  });
  const forces = [canonEntry({ id: "f1", part: "force", title: "The Ferrymen" })];

  // Bug caught: a step's due date missing from the almanac, or sorted away from its place in the world.
  it("lists an unreached step with a due date as due, in world order beside past ticks", () => {
    const events = almanac({ lore: [], forces, ticks: [tick("t1", { world_year: 600 })], steps: [dueStep()], items: [] });
    expect(events.map((e) => [e.kind, e.title])).toEqual([["due", "The Ferrymen: The ferry stops"], ["moving", "The Ferrymen moved closer"]]);
  });

  // Bug caught: a step already reached listed as due as well as the tick that says so.
  it("does not list a reached step", () => {
    expect(almanac({ lore: [], forces, ticks: [], steps: [dueStep({ reached_at: "x" })], items: [] })).toEqual([]);
  });
});
