import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), undo: vi.fn(), connect: vi.fn(), reorder: vi.fn(), campaignId: "campaign-1" }));
const whoByForce = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: () => "" } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get activeCampaignId() { return mocks.campaignId; } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntryInCampaign: () => ({ mutateAsync: mocks.create }), useUpdateCanonEntry: () => ({ mutateAsync: mocks.reorder }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([{ id: "fa1", name: "The Ferrymen" }]) }) }));
vi.mock("@/composables/canon/useForceFactions", () => ({ useForceFactions: () => ({ whoOf: (id: string) => whoByForce.current[id] ?? null, factionOf: () => null }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.connect }) }));
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
const mountIt = (rows = forces) => mount(ForcesSection, { props: { forces: rows }, global: { stubs: { CanonSuggestions: true, EntityCombobox: true } } });

describe("ForcesSection", () => {
  beforeEach(() => setActivePinia(createPinia()));
  beforeEach(() => { mocks.create.mockReset(); mocks.undo.mockReset(); mocks.connect.mockReset(); mocks.campaignId = "campaign-1"; whoByForce.current = {}; });

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

  const mountArc = (rows: typeof forces, arcLabel: string | null) => mount(ForcesSection, { props: { forces: rows, arcLabel }, global: { stubs: { CanonSuggestions: true, EntityCombobox: true } } });

  // Bug caught (#1255 item 11): under an arc the log still told of other arcs' forces, naming them "a force that is gone".
  it("under an arc the log tells only of the forces on screen", () => {
    expect(mountArc([forces[1]], "The guild").text()).not.toContain("A force that is gone");
    expect(mountArc([forces[0]], "The guild").get("[data-testid=force-tick-force]").text()).toBe("The Stain spreads");
  });

  // Bug caught: moving inside a narrowed list, where "up" would swap with a row that is not on screen.
  it("offers the move buttons only while no arc narrows the list", () => {
    expect(mountArc(forces, null).find("[data-testid=move-buttons]").exists()).toBe(true);
    expect(mountArc(forces, "The guild").find("[data-testid=move-buttons]").exists()).toBe(false);
  });

  // Bug caught (#1258 item 19): the forces helper left open on the page, above the ledger on every visit.
  it("keeps the helper inside the Suggest fold", () => {
    const fold = { name: "CanonSuggestFold", props: ["part"], template: "<div data-testid='fold'><slot /></div>" };
    const w = mount(ForcesSection, { props: { forces }, global: { stubs: { CanonSuggestions: true, CanonSuggestFold: fold, EntityCombobox: true } } });
    expect(w.get("[data-testid=fold]").findComponent({ name: "CanonSuggestions" }).exists()).toBe(true);
    expect(w.getComponent({ name: "CanonSuggestFold" }).props("part")).toBe("forces");
  });

  it("says nothing is moving when there are no forces", () => {
    expect(mountIt([]).text()).toContain("Nothing is moving yet");
  });

  // Bug caught (#1258 item 16): the force's title was copied from its faction, so renaming the faction left it stale and two plans by one faction shared a title.
  it("adds a force titled with what they are doing, empties the boxes and opens it", async () => {
    mocks.create.mockResolvedValue({ id: "f9" });
    const w = mountIt();
    await w.get("input[aria-label='What they are doing']").setValue(" The summoning ");
    await w.get("input[aria-label='What the new force wants']").setValue(" the river to themselves ");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ campaignId: "campaign-1", input: { part: "force", title: "The summoning", wants: "the river to themselves", sort_order: 2 } });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(w.emitted("select")?.[0]).toEqual(["f9"]);
    expect((w.get("input[aria-label='What they are doing']").element as HTMLInputElement).value).toBe("");
  });

  // Bug caught (#1258 item 16): choosing a faction wrote the faction's name as the title instead of the plan.
  it("with a faction chosen keeps the plan as the title and ties the force to the faction", async () => {
    mocks.create.mockResolvedValue({ id: "f9" });
    mocks.connect.mockResolvedValue(undefined);
    const w = mountIt();
    w.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "fa1");
    await w.get("input[aria-label='What they are doing']").setValue("The long march");
    await w.get("input[aria-label='What the new force wants']").setValue("the north");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ campaignId: "campaign-1", input: expect.objectContaining({ title: "The long march" }) });
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ subject: { kind: "canon", id: "f9" }, other: { kind: "faction", id: "fa1", name: "The Ferrymen" } }) }));
  });

  // Bug caught (#1258 item 16): the row named only the title, so a force's faction was invisible until it was opened.
  it("shows the linked faction's current name on the row as Who", () => {
    whoByForce.current = { f1: "The Ferrymen (renamed)" };
    const rows = mountIt().findAll("li");
    expect(rows[0].get("[data-testid=force-who]").text()).toContain("The Ferrymen (renamed)");
    expect(rows[1].find("[data-testid=force-who]").exists()).toBe(false);
  });

  it("will not add a force with no plan named or nothing wanted", async () => {
    const w = mountIt();
    await w.get("input[aria-label='What they are doing']").setValue("The summoning");
    expect(w.get("form button[type=submit]").attributes("disabled")).toBeDefined();
    await w.get("form").trigger("submit");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps the words and selects nothing when the create fails", async () => {
    mocks.create.mockRejectedValue(new Error("no"));
    const w = mountIt();
    await w.get("input[aria-label='What they are doing']").setValue("The Ferrymen");
    await w.get("input[aria-label='What the new force wants']").setValue("the river");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect((w.get("input[aria-label='What they are doing']").element as HTMLInputElement).value).toBe("The Ferrymen");
    expect(w.emitted("select")).toBeUndefined();
  });

  // Bug caught (#1255 item 9): an ended force stayed in the ledger as if it were still moving.
  it("keeps an ended force out of the ledger and counts it under No longer moving, naming its outcome", () => {
    const stopped = canonEntry({ id: "f3", part: "force", title: "The Old Guild", closed_as: "stopped", closed_at: "t" });
    const w = mountIt([...forces, stopped]);
    expect(w.get("[data-testid=force-ledger]").text()).not.toContain("The Old Guild");
    expect(w.get("[data-testid=force-ended-toggle]").text()).toContain("No longer moving (1)");
    const row = w.get("[data-testid=force-ended-ledger]");
    expect(row.text()).toContain("The Old Guild");
    expect(row.get("[data-testid=force-outcome]").text()).toBe("Ended: it was stopped");
  });

  it("shows no No longer moving drawer when every force is moving", () => {
    expect(mountIt().find("[data-testid=force-ended-section]").exists()).toBe(false);
  });
});
