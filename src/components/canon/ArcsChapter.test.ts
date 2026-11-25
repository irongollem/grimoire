import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { reactive, ref } from "vue";

const mocks = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn(), confirm: vi.fn(), replace: vi.fn() }));
const arcs = ref<Record<string, unknown>[]>([]);
const entries = ref<Record<string, unknown>[]>([]);
const route = reactive<{ query: Record<string, string> }>({ query: {} });
vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/composables/canon/useCanonArcs", () => ({
  useCanonArcs: () => ({ data: arcs }),
  useCanonArcActions: () => ({
    add: { mutateAsync: mocks.add, isPending: ref(false) },
    update: { mutate: mocks.update },
    remove: { mutate: mocks.remove },
    move: { mutate: mocks.move },
  }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

import ArcsChapter from "./ArcsChapter.vue";

const mountIt = () => mount(ArcsChapter, { global: { stubs: { ArcContents: true, CanonSuggest: true } } });
const status = (w: ReturnType<typeof mountIt>, label: string) => w.findAll("[aria-label='Where the arc stands'] button").find((b) => b.text() === label)!;

describe("ArcsChapter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
    route.query = {};
    const shape = { summary: null, status: "running", question: null, stakes: null, ending: null, theme_id: null };
    arcs.value = [{ id: "a1", name: "The drowned god", sort_order: 0, ...shape, question: "Who woke it?" }, { id: "a2", name: "The guild", sort_order: 1, ...shape }];
    entries.value = [];
  });

  it("lists the arcs with their question and where each stands, and opens the one the route names", () => {
    const rows = mountIt().findAll("li").map((li) => li.text());
    expect(rows[0]).toContain("The drowned god");
    expect(rows[0]).toContain("Who woke it?");
    expect(rows[0]).toContain("Running");
    route.query = { arc: "a2" };
    const w = mountIt();
    expect(w.find("[data-testid=arc-detail]").exists()).toBe(true);
    expect((w.get("[aria-label=\"The arc's name\"]").element as HTMLInputElement).value).toBe("The guild");
  });

  // Bug caught: the tapped row writing nothing to the route, so `?arc=` (the link a theme and the old page redirect make) and the list disagreed.
  it("selects through the route's ?arc=, keeping the rest of the query, and closes by dropping it", async () => {
    route.query = { keep: "1" };
    await mountIt().get("li button").trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { keep: "1", arc: "a1" } });
    route.query = { arc: "a1" };
    await mountIt().get("[data-testid=canon-entry-close]").trigger("click");
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { arc: undefined } });
  });

  // Bug caught (#1279 item 10): "Ask the Familiar" in the empty arcs list, for which the canon helper has no mode and which came back as truths.
  it("offers no Familiar request when there are no arcs", () => {
    arcs.value = [];
    const w = mountIt();
    expect(w.get("[data-testid=canon-empty]").text()).toContain("No arcs yet");
    expect(w.find("canon-suggest-stub").exists()).toBe(false);
  });

  it("adds an arc by its name and opens it", async () => {
    mocks.add.mockResolvedValue({ id: "a3" });
    const w = mountIt();
    await w.get("input[aria-label='A new arc']").setValue("The flood");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ name: "The flood", sort_order: 2 });
    expect(mocks.replace).toHaveBeenCalledWith({ query: { arc: "a3" } });
  });

  // Bug caught: the arc deleted without asking, or deleted after the DM said no.
  it("asks before deleting an arc, deletes nothing on no and closes the pane on yes", async () => {
    route.query = { arc: "a1" };
    mocks.confirm.mockResolvedValue(false);
    const w = mountIt();
    await w.get("[data-testid=canon-entry-delete]").trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith("Delete this arc? Its entries stay, in no arc.", expect.anything());
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue(true);
    await w.get("[data-testid=canon-entry-delete]").trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith("a1");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { arc: undefined } });
  });

  it("moves an arc through the shared order rule", async () => {
    await mountIt().get("button[aria-label='Move The drowned god down']").trigger("click");
    expect(mocks.move).toHaveBeenCalledWith({ arcs: arcs.value, id: "a1", direction: 1 });
  });

  describe("the shape of an arc", () => {
    // Bug caught: the ending of an ended arc never written (or written to the summary), so "How it ended" came back empty.
    it("writes the ending of an ended arc when the field is left, and clears it when emptied", async () => {
      arcs.value = [{ ...arcs.value[0]!, status: "ended", ending: "The god slept." }];
      route.query = { arc: "a1" };
      const field = mountIt().get("[aria-label='How it ended']");
      await field.setValue("The god woke.");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { ending: "The god woke." } });
      await field.setValue("   ");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { ending: null } });
    });

    // Bug caught: the ending box offered on an arc that is still going, where the table refuses an ending (23514).
    it("offers How it ended only on an ended arc", () => {
      route.query = { arc: "a1" };
      expect(mountIt().find("[aria-label='How it ended']").exists()).toBe(false);
    });

    // Bug caught: the question and the stakes writing each other's column.
    it("saves the question and the stakes each to its own column", async () => {
      route.query = { arc: "a1" };
      const w = mountIt();
      await w.get("[aria-label='The question it asks']").setValue("Who woke the god?");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { question: "Who woke the god?" } });
      await w.get("[aria-label='What is at stake']").setValue("The harbour town");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { stakes: "The harbour town" } });
    });

    // Bug caught: Running chosen on an ended arc leaving the ending behind (the write fails 23514), or clearing it unasked.
    it("asks before clearing the ending, then sets Running and clears the ending in one write; no leaves it alone", async () => {
      arcs.value = [{ ...arcs.value[0]!, status: "ended", ending: "The god slept." }];
      route.query = { arc: "a1" };
      const w = mountIt();
      mocks.confirm.mockResolvedValue(false);
      await status(w, "Running").trigger("click");
      await flushPromises();
      expect(mocks.update).not.toHaveBeenCalled();
      mocks.confirm.mockResolvedValue(true);
      await status(w, "Running").trigger("click");
      await flushPromises();
      expect(mocks.update).toHaveBeenCalledWith({ id: "a1", patch: { status: "running", ending: null } });
    });

    // Bug caught: every status change asking, so planning an arc interrupts the DM for nothing.
    it("changes a running arc to ended without asking", async () => {
      route.query = { arc: "a1" };
      await status(mountIt(), "Ended").trigger("click");
      await flushPromises();
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledWith({ id: "a1", patch: { status: "ended" } });
    });

    // Bug caught: the picker offering every premise line so an arc could carry a veil, which the table refuses.
    it("offers only the premise's theme lines, and saves the one chosen as theme_id", async () => {
      entries.value = [
        { id: "t1", part: "premise", premise_kind: "theme", title: "Debts are owed" },
        { id: "v1", part: "premise", premise_kind: "veil", title: "The mayor" },
      ];
      route.query = { arc: "a1" };
      const select = mountIt().get("select[aria-label='The theme it carries']");
      expect(select.findAll("option").map((o) => o.text())).toEqual(["No theme", "Debts are owed"]);
      await select.setValue("t1");
      expect(mocks.update).toHaveBeenLastCalledWith({ id: "a1", patch: { theme_id: "t1" } });
    });
  });
});
