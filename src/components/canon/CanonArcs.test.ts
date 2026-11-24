import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn(), confirm: vi.fn() }));
const arcs = ref<Record<string, unknown>[]>([]);
const entries = ref<Record<string, unknown>[]>([]);
const RouterLink = { name: "RouterLink", props: ["to"], template: "<a :href=\"String(to)\"><slot /></a>" };
vi.mock("@/composables/canon/useCanonArcs", () => ({
  useCanonArcs: () => ({ data: arcs, isSuccess: ref(true) }),
  useCanonArcActions: () => ({
    add: { mutateAsync: mocks.add, isPending: ref(false) },
    update: { mutate: mocks.update },
    remove: { mutate: mocks.remove },
    move: { mutate: mocks.move },
  }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

import CanonArcs from "./CanonArcs.vue";
import { useCanonUiStore } from "@/stores/ui/canon";

const mountArcs = () => mount(CanonArcs, { global: { stubs: { RouterLink } } });

describe("CanonArcs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
    const shape = { summary: null, status: "running", question: null, stakes: null, ending: null, theme_id: null };
    arcs.value = [{ id: "a1", name: "The drowned god", sort_order: 0, ...shape }, { id: "a2", name: "The guild", sort_order: 1, ...shape }];
    entries.value = [];
  });

  it("with no arcs shows only Arcs… and the hint, no Show control", () => {
    arcs.value = [];
    const w = mountArcs();
    expect(w.find("select").exists()).toBe(false);
    expect(w.text()).toContain("Group the canon by the story it belongs to.");
    expect(w.find("[data-testid=arcs-toggle]").exists()).toBe(true);
  });

  // Bug caught: the select writing somewhere other than the page's store, so no part narrowed.
  it("choosing an arc narrows the page through the store, and Clear brings everything back", async () => {
    const store = useCanonUiStore();
    const w = mountArcs();
    expect(w.find("[data-testid=arc-clear]").exists()).toBe(false);
    await w.find("select").setValue("a2");
    expect(store.arcFilter).toBe("a2");
    await w.find("[data-testid=arc-clear]").trigger("click");
    expect(store.arcFilter).toBeNull();
  });

  // Bug caught (#1255 item 11): Clear on the arc also wiping the search the DM had typed.
  it("clearing the arc leaves the page's search alone", async () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    store.query = "river";
    const w = mountArcs();
    await w.find("[data-testid=arc-clear]").trigger("click");
    expect(store.query).toBe("river");
  });

  // Bug caught: a deleted arc staying chosen, so every part is narrowed to nothing with no way to see why.
  it("lets go of an arc that is gone", async () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    mountArcs();
    arcs.value = [arcs.value[1]];
    await flushPromises();
    expect(store.arcFilter).toBeNull();
  });

  it("adds an arc with its name and its line, trimmed, and empties the boxes", async () => {
    mocks.add.mockResolvedValue({});
    const w = mountArcs();
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    await w.find("input[aria-label='A new arc']").setValue("  The flood  ");
    await w.find("input[aria-label='What the new arc is about']").setValue("The river rises.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ name: "The flood", summary: "The river rises.", sort_order: 2 });
    expect((w.find("input[aria-label='A new arc']").element as HTMLInputElement).value).toBe("");
  });

  it("will not add an arc with no name", async () => {
    const w = mountArcs();
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    expect(w.find("button[type=submit]").attributes("disabled")).toBeDefined();
  });

  // Bug caught: the arc deleted without asking, or deleted after the DM said no.
  it("asks before deleting an arc, and deletes nothing when the DM says no", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountArcs();
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    await w.find("button[aria-label='Delete this arc']").trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith("Delete this arc? Its entries stay, in no arc.", expect.anything());
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes the arc once the DM confirms", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountArcs();
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    await w.find("button[aria-label='Delete this arc']").trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith("a1");
  });

  it("moves an arc later through the shared order rule", async () => {
    const w = mountArcs();
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    await w.find("button[aria-label='Move this arc later']").trigger("click");
    expect(mocks.move).toHaveBeenCalledWith({ arcs: arcs.value, id: "a1", direction: 1 });
  });

  describe("the shape of an arc (#1258 item 7)", () => {
    async function openPanel() {
      const w = mountArcs();
      await w.find("[data-testid=arcs-toggle]").trigger("click");
      return w;
    }

    // Bug caught: the ending of an ended arc never written (or written to the summary), so "How it ended" came back empty.
    it("writes the ending of an ended arc when the field is left, and clears it when emptied", async () => {
      arcs.value = [{ ...arcs.value[0]!, status: "ended", ending: "The god slept." }];
      const w = await openPanel();
      const field = w.find("[aria-label='How it ended']");
      await field.setValue("The god woke.");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { ending: "The god woke." } });
      await field.setValue("   ");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { ending: null } });
    });

    // Bug caught: the ending box offered on an arc that is still going, where the table refuses an ending (23514).
    it("offers How it ended only on an ended arc", async () => {
      expect((await openPanel()).find("[aria-label='How it ended']").exists()).toBe(false);
    });

    // Bug caught: the question and the stakes writing each other's column, or an emptied one left as an empty string.
    it("saves the question and the stakes each to its own column, emptied as null", async () => {
      const w = await openPanel();
      await w.find("[aria-label='The question it asks']").setValue("Who woke the god?");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { question: "Who woke the god?" } });
      await w.find("[aria-label='What is at stake']").setValue("The harbour town");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { stakes: "The harbour town" } });
      arcs.value = [{ ...arcs.value[0]!, stakes: "The harbour town" }, arcs.value[1]!];
      await flushPromises();
      await w.find("[aria-label='What is at stake']").setValue("");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { stakes: null } });
    });

    // Bug caught: Running chosen on an ended arc leaving the ending behind (the write fails 23514), or clearing it unasked.
    it("asks before clearing the ending, then sets Running and clears the ending in one write", async () => {
      arcs.value = [{ ...arcs.value[0]!, status: "ended", ending: "The god slept." }];
      mocks.confirm.mockResolvedValue(true);
      const w = await openPanel();
      const running = w.findAll("[aria-label='Where the arc stands'] button").find((b) => b.text() === "Running")!;
      await running.trigger("click");
      await flushPromises();
      expect(mocks.confirm).toHaveBeenCalledOnce();
      expect(mocks.update).toHaveBeenCalledWith({ id: "a1", patch: { status: "running", ending: null } });
    });

    it("keeps the arc ended, and its ending, when the DM says no", async () => {
      arcs.value = [{ ...arcs.value[0]!, status: "ended", ending: "The god slept." }];
      mocks.confirm.mockResolvedValue(false);
      const w = await openPanel();
      await w.findAll("[aria-label='Where the arc stands'] button").find((b) => b.text() === "Running")!.trigger("click");
      await flushPromises();
      expect(mocks.update).not.toHaveBeenCalled();
    });

    // Bug caught: every status change asking, so planning an arc interrupts the DM for nothing.
    it("changes a running arc to ended without asking", async () => {
      const w = await openPanel();
      await w.findAll("[aria-label='Where the arc stands'] button").find((b) => b.text() === "Ended")!.trigger("click");
      await flushPromises();
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledWith({ id: "a1", patch: { status: "ended" } });
    });

    // Bug caught: the picker offering every premise line (or none) so an arc could carry a veil, which the table refuses.
    it("offers only the premise's theme lines, and saves the one chosen (or none) as theme_id", async () => {
      entries.value = [
        { id: "t1", part: "premise", premise_kind: "theme", title: "Debts are owed" },
        { id: "v1", part: "premise", premise_kind: "veil", title: "The mayor" },
        { id: "x1", part: "truth", premise_kind: null, title: "A truth" },
      ];
      const w = await openPanel();
      const select = w.find("select[aria-label='The theme it carries']");
      expect(select.findAll("option").map((o) => o.text())).toEqual(["No theme", "Debts are owed"]);
      await select.setValue("t1");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { theme_id: "t1" } });
    });

    // Bug caught: the row linking to the wrong arc's page.
    it("links each arc to its own page", async () => {
      const w = await openPanel();
      expect(w.findAll("[data-testid=arc-open]").map((a) => a.attributes("href"))).toEqual(["/canon/arcs/a1", "/canon/arcs/a2"]);
    });
  });
});
