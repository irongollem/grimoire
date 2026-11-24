import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ reorder: vi.fn() }));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: () => "" } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutateAsync: mocks.reorder }) }));
vi.mock("@/composables/canon/useCanonForces", async (original) => ({
  ...(await original<typeof import("@/composables/canon/useCanonForces")>()),
  useCanonForceData: () => ({
    data: ref({
      steps: [
        { id: "s1", force_id: "f1", title: "The orchards sour.", sort_order: 0, reached_at: null },
        { id: "s2", force_id: "f2", title: "Another force's step", sort_order: 0, reached_at: null },
      ],
      ticks: [{ id: "t1", force_id: "f1", delta: 2, created_at: "x" }],
      quests: [],
    }),
  }),
}));

import ForcesChapter from "./ForcesChapter.vue";

const forces = [canonEntry({ id: "f1", part: "force", title: "The Stain spreads", clock_size: 6 }), canonEntry({ id: "f2", part: "force", title: "The Brewlings" })];
const DetailStub = { name: "ForceDetail", props: ["entry"], emits: ["close", "delete"], template: "<div data-testid='detail'><button data-testid='detail-delete' @click=\"$emit('delete')\" /></div>" };
const mountIt = (props: { forces?: typeof forces; selectedId?: string | null; arcLabel?: string | null } = {}) =>
  mount(ForcesChapter, { props: { forces, ...props }, global: { stubs: { CanonReview: true, ForceDetail: DetailStub, ForceAddForm: true, CanonSuggest: true } } });

describe("ForcesChapter", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: a row reading another force's steps or ticks (the data is one read for the whole list).
  it("shows each force with its own clock and its own next step, never another force's", () => {
    const rows = mountIt().findAll("li");
    expect(rows[0].get("[data-testid=force-clock-tally]").text()).toBe("2 of 6");
    expect(rows[0].get("[data-testid=force-next]").text()).toBe("Next: The orchards sour.");
    expect(rows[1].get("[data-testid=force-next]").text()).toBe("Next: Another force's step");
    expect(rows[1].get("[data-testid=force-clock-tally]").text()).toBe("No clock");
  });

  // Bug caught: the chapter keeping the old log beside the list.
  it("no longer shows a log of every force's ticks", () => {
    expect(mountIt().find("[data-testid=force-log]").exists()).toBe(false);
  });

  // Bug caught: the entry opening for the wrong force, or not at all, so the list had no single place for it.
  it("opens the entry of the selected force beside the list and passes close and delete up", async () => {
    const w = mountIt({ selectedId: "f2" });
    expect(w.getComponent(DetailStub).props("entry")).toMatchObject({ id: "f2" });
    await w.get("[data-testid=detail-delete]").trigger("click");
    expect(w.emitted("delete")).toHaveLength(1);
    expect(mountIt().find("[data-testid=detail]").exists()).toBe(false);
  });

  it("selects a force when its row is pressed", async () => {
    const w = mountIt();
    await w.findAll("li")[1].get("button").trigger("click");
    expect(w.emitted("select")?.[0]).toEqual(["f2"]);
  });

  // Bug caught: moving inside a narrowed list, where "up" would swap with a row that is not on screen.
  it("offers the move buttons only while no arc narrows the list", () => {
    expect(mountIt().find("[data-testid=move-buttons]").exists()).toBe(true);
    expect(mountIt({ arcLabel: "The guild" }).find("[data-testid=move-buttons]").exists()).toBe(false);
  });

  it("says what a force is when there are none, and offers to ask for one", () => {
    const w = mountIt({ forces: [] });
    expect(w.text()).toContain("No forces yet");
    expect(w.findComponent({ name: "CanonSuggest" }).props("request")).toBe("Suggest a force that is moving in my world.");
  });

  // Bug caught (#1255 item 9): an ended force stayed in the ledger as if it were still moving.
  it("keeps an ended force out of the ledger and counts it under No longer moving, naming its outcome", () => {
    const stopped = canonEntry({ id: "f3", part: "force", title: "The Old Guild", closed_as: "stopped", closed_at: "t" });
    const w = mountIt({ forces: [...forces, stopped] });
    expect(w.get("[data-testid=force-ledger]").text()).not.toContain("The Old Guild");
    expect(w.get("[data-testid=force-ended-toggle]").text()).toContain("No longer moving (1)");
    expect(w.get("[data-testid=force-ended-ledger]").get("[data-testid=force-outcome]").text()).toBe("Ended: it was stopped");
  });

  it("shows no No longer moving drawer when every force is moving", () => {
    expect(mountIt().find("[data-testid=force-ended-section]").exists()).toBe(false);
  });

  // Bug caught: a new force landing without being opened, so the DM had to find it.
  it("opens the force the add form made", () => {
    const w = mountIt();
    w.getComponent({ name: "ForceAddForm" }).vm.$emit("added", "f9");
    expect(w.emitted("select")?.[0]).toEqual(["f9"]);
  });
});
