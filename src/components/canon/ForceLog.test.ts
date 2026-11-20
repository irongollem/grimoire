import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: { formatDate: (y: number, m: number, d: number) => `${d} Ches ${y} DR (m${m})` } }),
}));

import ForceLog from "./ForceLog.vue";
import type { CanonForceTick } from "@/types/canon.types";

const tick = (over: Partial<CanonForceTick>): CanonForceTick => ({
  id: "t1", user_id: "u", campaign_id: "c", force_id: "f1", delta: 1, note: "", session_id: null, step_id: null, world_year: null, world_month: null,
  world_day: null, created_at: "2026-11-19T10:00:00Z", ...over,
});

describe("ForceLog", () => {
  const ticks = [tick({ id: "old", note: "A week passed", created_at: "2026-11-18T10:00:00Z" }), tick({ id: "new", note: "The orchards sour", created_at: "2026-11-20T10:00:00Z" })];

  it("lists the ticks newest first", () => {
    const rows = mount(ForceLog, { props: { ticks } }).findAll("[data-testid=force-tick]");
    expect(rows.map((r) => r.text())).toEqual([expect.stringContaining("The orchards sour"), expect.stringContaining("A week passed")]);
  });

  it("offers Undo on the newest tick only, so the log can never skip one", () => {
    const rows = mount(ForceLog, { props: { ticks } }).findAll("[data-testid=force-tick]");
    expect(rows[0].find("button").exists()).toBe(true);
    expect(rows[1].find("button").exists()).toBe(false);
  });

  it("emits the tick that Undo was pressed on", async () => {
    const w = mount(ForceLog, { props: { ticks } });
    await w.find("button").trigger("click");
    expect(w.emitted("undo")?.[0][0]).toMatchObject({ id: "new" });
  });

  it("names each tick's force when given the names, so the log across every force says who moved", () => {
    const w = mount(ForceLog, { props: { ticks: [tick({ force_id: "f1" }), tick({ id: "t2", force_id: "f2" })], forceName: (id: string) => (id === "f1" ? "The Stain" : "The Ferrymen") } });
    expect(w.findAll("[data-testid=force-tick-force]").map((n) => n.text()).sort()).toEqual(["The Ferrymen", "The Stain"]);
    expect(mount(ForceLog, { props: { ticks } }).find("[data-testid=force-tick-force]").exists()).toBe(false);
  });

  it("offers Undo on each force's own newest tick across the log, never on an older one of the same force", () => {
    const all = [
      tick({ id: "a-old", force_id: "a", created_at: "2026-11-18T10:00:00Z" }), tick({ id: "a-new", force_id: "a", created_at: "2026-11-20T10:00:00Z" }),
      tick({ id: "b-old", force_id: "b", created_at: "2026-11-17T10:00:00Z" }), tick({ id: "b-new", force_id: "b", created_at: "2026-11-19T10:00:00Z" }),
    ];
    const w = mount(ForceLog, { props: { ticks: all, forceName: (id: string) => id } });
    const withUndo = w.findAll("[data-testid=force-tick]").filter((r) => r.find("button").exists()).map((r) => r.find("[data-testid=force-tick-force]").text());
    expect(withUndo).toHaveLength(2);
    expect(w.findAll("button")).toHaveLength(2);
  });

  it("says what a note-less tick was, by direction", () => {
    const w = mount(ForceLog, { props: { ticks: [tick({ delta: -1 })] } });
    expect(w.text()).toContain("Ticked back by hand.");
  });

  it("shows the world's date only when the tick recorded all of it", () => {
    const dated = mount(ForceLog, { props: { ticks: [tick({ world_year: 1492, world_month: 3, world_day: 18 })] } });
    expect(dated.text()).toContain("in the story: 18 Ches 1492 DR (m3)");
    const partial = mount(ForceLog, { props: { ticks: [tick({ world_year: 1492 })] } });
    expect(partial.text()).not.toContain("in the story");
  });
});
