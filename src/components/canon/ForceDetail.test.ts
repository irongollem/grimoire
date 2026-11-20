import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonForceTick } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), tick: vi.fn(), undo: vi.fn() }));
const forceData = ref<{ steps: unknown[]; ticks: CanonForceTick[]; quests: unknown[] }>({ steps: [], ticks: [], quests: [] });

vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: () => "" } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutate: mocks.update }) }));
vi.mock("@/composables/canon/useCanonForces", async (original) => ({
  ...(await original<typeof import("@/composables/canon/useCanonForces")>()),
  useCanonForceData: () => ({ data: forceData }),
  useTickForce: () => ({ mutate: mocks.tick }),
  useUndoForceTick: () => ({ mutate: mocks.undo }),
}));

import ForceDetail from "./ForceDetail.vue";

const tick = (over: Partial<CanonForceTick>): CanonForceTick => ({
  id: "t1", user_id: "u", campaign_id: "c1", force_id: "f1", delta: 1, note: "", session_id: null, step_id: null, world_year: null, world_month: null,
  world_day: null, created_at: "2026-11-19T10:00:00Z", ...over,
});
const force = (over = {}) => canonEntry({ id: "f1", campaign_id: "c1", part: "force", title: "The Stain spreads", wants: "to be forgotten into", clock_size: 6, ...over });

const mountIt = (entry = force()) =>
  mount(ForceDetail, { props: { entry }, global: { stubs: { ForceSteps: true, ForceQuests: true, ConnectionsSection: true } } });

describe("ForceDetail", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    forceData.value = { steps: [], ticks: [], quests: [] };
  });

  it("draws the clock as the sum of this force's ticks only, clamped to its size, never another force's", () => {
    forceData.value.ticks = [tick({ id: "a" }), tick({ id: "b" }), tick({ id: "c", force_id: "other" })];
    expect(mountIt().get("[data-testid=force-clock-tally]").text()).toBe("2 of 6");
    forceData.value.ticks = Array.from({ length: 9 }, (_, i) => tick({ id: `t${i}` }));
    expect(mountIt().get("[data-testid=force-clock-tally]").text()).toBe("6 of 6");
  });

  it("ticks forward by one with the note typed beside it, then empties the note", async () => {
    const w = mountIt();
    await w.get("input[aria-label='Why the world moved']").setValue("  The orchards sour ");
    await w.get("[data-testid=tick-forward]").trigger("click");
    expect(mocks.tick).toHaveBeenCalledWith({ campaignId: "c1", forceId: "f1", delta: 1, note: "The orchards sour" });
    expect((w.get("input[aria-label='Why the world moved']").element as HTMLInputElement).value).toBe("");
  });

  it("ticks back by one", async () => {
    forceData.value.ticks = [tick({})];
    await mountIt().get("[data-testid=tick-back]").trigger("click");
    expect(mocks.tick).toHaveBeenCalledWith({ campaignId: "c1", forceId: "f1", delta: -1, note: "" });
  });

  it("cannot tick back from nothing or forward from full, so the log never holds a tick the dial hides", () => {
    expect(mountIt().get("[data-testid=tick-back]").attributes("disabled")).toBeDefined();
    forceData.value.ticks = Array.from({ length: 6 }, (_, i) => tick({ id: `t${i}` }));
    expect(mountIt().get("[data-testid=tick-forward]").attributes("disabled")).toBeDefined();
  });

  it("keeps no ticking controls for a force with no clock", () => {
    const w = mountIt(force({ clock_size: null }));
    expect(w.find("[data-testid=tick-forward]").exists()).toBe(false);
  });

  it("undoes the newest tick by id", async () => {
    forceData.value.ticks = [tick({ id: "old", created_at: "2026-11-18T10:00:00Z" }), tick({ id: "new", created_at: "2026-11-20T10:00:00Z" })];
    await mountIt().get("[data-testid=force-log] button").trigger("click");
    expect(mocks.undo).toHaveBeenCalledWith(expect.objectContaining({ id: "new" }));
  });

  it("saves who and what it wants when a field is left, and a clock size when it is chosen", async () => {
    const w = mountIt();
    await w.get("input[aria-label='What it wants']").setValue("the river");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: { wants: "the river" } });
    await w.get("input[aria-label='Who moves']").setValue("The Stain");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: { title: "The Stain" } });
    await w.get("select[aria-label='Clock size']").setValue("8");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: { clock_size: 8 } });
  });

  it("emits delete", async () => {
    const w = mountIt();
    await w.findAll("button").find((b) => b.text() === "Delete this force")!.trigger("click");
    expect(w.emitted("delete")).toHaveLength(1);
  });
});
