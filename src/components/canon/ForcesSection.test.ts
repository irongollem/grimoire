import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), undo: vi.fn() }));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: () => "" } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntry: () => ({ mutateAsync: mocks.create, isPending: ref(false) }) }));
vi.mock("@/composables/canon/useCanonForces", async (original) => ({
  ...(await original<typeof import("@/composables/canon/useCanonForces")>()),
  useUndoForceTick: () => ({ mutate: mocks.undo }),
  useCanonForceData: () => ({
    data: ref({
      steps: [
        { id: "s1", force_id: "f1", title: "The orchards sour.", sort_order: 0, reached_at: "x" },
        { id: "s2", force_id: "f2", title: "Another force's step", sort_order: 0, reached_at: "y" },
      ],
      ticks: [{ id: "t1", force_id: "f1", delta: 2, created_at: "x" }],
      quests: [],
    }),
  }),
}));

import ForcesSection from "./ForcesSection.vue";

const forces = [canonEntry({ id: "f1", part: "force", title: "The Stain spreads", wants: "to be forgotten into", clock_size: 6 }), canonEntry({ id: "f2", part: "force", title: "The Brewlings", wants: "somewhere north" })];
const mountIt = (rows = forces) => mount(ForcesSection, { props: { forces: rows }, global: { stubs: { CanonSuggestions: true } } });

describe("ForcesSection", () => {
  beforeEach(() => { mocks.create.mockReset(); mocks.undo.mockReset(); });

  it("shows each force with its own clock and its own reached step, never another force's", () => {
    const rows = mountIt().findAll("li");
    expect(rows[0].get("[data-testid=force-clock-tally]").text()).toBe("2 of 6");
    expect(rows[0].get("[data-testid=force-step-reached]").text()).toContain("The orchards sour.");
    expect(rows[1].get("[data-testid=force-step-reached]").text()).toContain("Another force's step");
    expect(rows[1].text()).toContain("no clock");
  });

  it("beside the list, logs every force's ticks newest first, each naming its force, and undoes the tick it is given", async () => {
    const w = mountIt();
    const log = w.get("[data-testid=force-log]");
    expect(log.get("[data-testid=force-tick-force]").text()).toBe("The Stain spreads");
    await log.get("button").trigger("click");
    expect(mocks.undo).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
  });

  it("says nothing is moving when there are no forces", () => {
    expect(mountIt([]).text()).toContain("Nothing is moving yet");
  });

  it("adds a force with who and what it wants, empties the boxes and opens it", async () => {
    mocks.create.mockResolvedValue({ id: "f9" });
    const w = mountIt();
    await w.get("input[aria-label='A new force']").setValue(" The Ferrymen ");
    await w.get("input[aria-label='What the new force wants']").setValue(" the river to themselves ");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ part: "force", title: "The Ferrymen", wants: "the river to themselves", sort_order: 2 });
    expect(w.emitted("select")?.[0]).toEqual(["f9"]);
    expect((w.get("input[aria-label='A new force']").element as HTMLInputElement).value).toBe("");
  });

  it("will not add a force with nobody named or nothing wanted", async () => {
    const w = mountIt();
    await w.get("input[aria-label='A new force']").setValue("The Ferrymen");
    expect(w.get("form button[type=submit]").attributes("disabled")).toBeDefined();
    await w.get("form").trigger("submit");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps the words and selects nothing when the create fails", async () => {
    mocks.create.mockRejectedValue(new Error("no"));
    const w = mountIt();
    await w.get("input[aria-label='A new force']").setValue("The Ferrymen");
    await w.get("input[aria-label='What the new force wants']").setValue("the river");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect((w.get("input[aria-label='A new force']").element as HTMLInputElement).value).toBe("The Ferrymen");
    expect(w.emitted("select")).toBeUndefined();
  });
});
