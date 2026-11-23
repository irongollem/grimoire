import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn(), confirm: vi.fn() }));
const arcs = ref<{ id: string; name: string; summary: string | null; sort_order: number }[]>([]);
vi.mock("@/composables/canon/useCanonArcs", () => ({
  useCanonArcs: () => ({ data: arcs, isSuccess: ref(true) }),
  useCanonArcActions: () => ({
    add: { mutateAsync: mocks.add, isPending: ref(false) },
    update: { mutate: mocks.update },
    remove: { mutate: mocks.remove },
    move: { mutate: mocks.move },
  }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

import CanonArcs from "./CanonArcs.vue";
import { useCanonUiStore } from "@/stores/ui/canon";

describe("CanonArcs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
    arcs.value = [{ id: "a1", name: "The drowned god", summary: null, sort_order: 0 }, { id: "a2", name: "The guild", summary: null, sort_order: 1 }];
  });

  it("with no arcs shows only Arcs… and the hint, no Show control", () => {
    arcs.value = [];
    const w = mount(CanonArcs);
    expect(w.find("select").exists()).toBe(false);
    expect(w.text()).toContain("Group the canon by the story it belongs to.");
    expect(w.find("[data-testid=arcs-toggle]").exists()).toBe(true);
  });

  // Bug caught: the select writing somewhere other than the page's store, so no part narrowed.
  it("choosing an arc narrows the page through the store, and Clear brings everything back", async () => {
    const store = useCanonUiStore();
    const w = mount(CanonArcs);
    expect(w.find("[data-testid=arc-clear]").exists()).toBe(false);
    await w.find("select").setValue("a2");
    expect(store.arcFilter).toBe("a2");
    await w.find("[data-testid=arc-clear]").trigger("click");
    expect(store.arcFilter).toBeNull();
  });

  // Bug caught (#1255 item 11): Clear on the arc also wiping the searches the DM had typed.
  it("clearing the arc leaves a part's search alone", async () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    store.partQuery.truths = "river";
    const w = mount(CanonArcs);
    await w.find("[data-testid=arc-clear]").trigger("click");
    expect(store.partQuery.truths).toBe("river");
  });

  // Bug caught: a deleted arc staying chosen, so every part is narrowed to nothing with no way to see why.
  it("lets go of an arc that is gone", async () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    mount(CanonArcs);
    arcs.value = [arcs.value[1]];
    await flushPromises();
    expect(store.arcFilter).toBeNull();
  });

  it("adds an arc with its name and its line, trimmed, and empties the boxes", async () => {
    mocks.add.mockResolvedValue({});
    const w = mount(CanonArcs);
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    await w.find("input[aria-label='A new arc']").setValue("  The flood  ");
    await w.find("input[aria-label='What the new arc is about']").setValue("The river rises.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ name: "The flood", summary: "The river rises.", sort_order: 2 });
    expect((w.find("input[aria-label='A new arc']").element as HTMLInputElement).value).toBe("");
  });

  it("will not add an arc with no name", async () => {
    const w = mount(CanonArcs);
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    expect(w.find("button[type=submit]").attributes("disabled")).toBeDefined();
  });

  // Bug caught: the arc deleted without asking, or deleted after the DM said no.
  it("asks before deleting an arc, and deletes nothing when the DM says no", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mount(CanonArcs);
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    await w.find("button[aria-label='Delete this arc']").trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith("Delete this arc? Its entries stay, in no arc.", expect.anything());
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes the arc once the DM confirms", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mount(CanonArcs);
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    await w.find("button[aria-label='Delete this arc']").trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith("a1");
  });

  it("moves an arc later through the shared order rule", async () => {
    const w = mount(CanonArcs);
    await w.find("[data-testid=arcs-toggle]").trigger("click");
    await w.find("button[aria-label='Move this arc later']").trigger("click");
    expect(mocks.move).toHaveBeenCalledWith({ arcs: arcs.value, id: "a1", direction: 1 });
  });
});
