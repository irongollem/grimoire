import { describe, expect, it } from "vitest";
import { canonCalendarItems, canonOnCalendarEnabled } from "./canonCalendar";
import { canonEntry } from "@/test/canonEntry";
import type { CanonForceStep, CanonForceTick } from "@/types/canon.types";

const tick = (id: string, over: Partial<CanonForceTick> = {}): CanonForceTick => ({
  id, user_id: "u", campaign_id: "c1", force_id: "f1", delta: 1, note: "", session_id: null, step_id: null,
  world_year: null, world_month: null, world_day: null, created_at: "2026-11-01T10:00:00Z", ...over,
});
const forces = [canonEntry({ id: "f1", part: "force", title: "The Ferrymen" })];

describe("canonCalendarItems", () => {
  // Bug caught: dated lore and a force's dated tick never reaching the Calendar, or arriving unlabelled and in the wrong order.
  it("offers dated lore and a dated force tick in world order, each worded and linked to the canon", () => {
    const items = canonCalendarItems({
      lore: [canonEntry({ id: "l1", part: "lore", title: "The roads are first spun", world_year: 460, world_month: 1 })],
      forces,
      ticks: [tick("t1", { world_year: 400, note: "stop paying the toll" })],
    });
    expect(items.map((i) => [i.label, i.title, i.to])).toEqual([
      ["A force moved", "The Ferrymen: stop paying the toll", { path: "/canon", query: { entry: "f1" } }],
      ["Lore", "The roads are first spun", { path: "/canon", query: { entry: "l1" } }],
    ]);
  });

  // Bug caught: undated lore and an undated tick pinned to year 0 on the timeline.
  it("leaves out what has no world date, and a tick whose force is gone", () => {
    const items = canonCalendarItems({
      lore: [canonEntry({ id: "l", part: "lore", world_year: null })],
      forces,
      ticks: [tick("t", { world_year: null }), tick("gone", { force_id: "x", world_year: 5 })],
    });
    expect(items).toEqual([]);
  });

  // Bug caught: a truth or secret that happens to carry a date shown as "Lore" on the calendar, leaking what the DM has not told.
  it("offers only lore entries, not other canon parts that carry a date", () => {
    const items = canonCalendarItems({ lore: [canonEntry({ id: "s", part: "secret", world_year: 3 })], forces, ticks: [] });
    expect(items).toEqual([]);
  });
});

describe("canonOnCalendarEnabled", () => {
  const dm = { isDM: true, dmPreview: false, show: true, campaignId: "c1" };

  // Bug caught: the DM-only canon reads running for a player's Calendar (the read is refused, and the page would error).
  it("reads for the DM, and not for a player, a DM previewing the player portal, or with the toggle off", () => {
    expect(canonOnCalendarEnabled(dm)).toBe(true);
    expect(canonOnCalendarEnabled({ ...dm, isDM: false })).toBe(false);
    expect(canonOnCalendarEnabled({ ...dm, dmPreview: true })).toBe(false);
    expect(canonOnCalendarEnabled({ ...dm, show: false })).toBe(false);
    expect(canonOnCalendarEnabled({ ...dm, campaignId: null })).toBe(false);
  });
});

const step = (over: Partial<CanonForceStep>): CanonForceStep => ({
  id: "s1", user_id: "u", campaign_id: "c1", force_id: "f1", title: "The ferry stops", sort_order: 0, reached_at: null, reached_session_id: null,
  due_year: null, due_month: null, due_day: null, calendar_event_id: null, ai_provenance: null, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...over,
});

describe("canonCalendarItems: steps that are due", () => {
  // Bug caught: a step's due date never reaching the Calendar, or arriving before the tick that came before it.
  it("offers an unreached step with a due date beside the past ticks, in world order", () => {
    const items = canonCalendarItems({ lore: [], forces, ticks: [tick("t1", { world_year: 400 })], steps: [step({ due_year: 512, due_month: 3 })] });
    expect(items.map((i) => [i.label, i.title, i.year, i.month])).toEqual([
      ["A force moved", "The Ferrymen moved closer", 400, null],
      ["A step due", "The Ferrymen: The ferry stops", 512, 3],
    ]);
  });

  // Bug caught: a step already reached drawn twice (as its tick and as "due"), or an undated one pinned to year 0.
  it("leaves out reached and undated steps", () => {
    const items = canonCalendarItems({ lore: [], forces, ticks: [], steps: [step({ id: "a", due_year: 5, reached_at: "x" }), step({ id: "b" })] });
    expect(items).toEqual([]);
  });
});
