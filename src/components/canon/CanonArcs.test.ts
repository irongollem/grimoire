import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const arcs = ref<Record<string, unknown>[]>([]);
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: arcs, isSuccess: ref(true) }) }));

import CanonArcs from "./CanonArcs.vue";
import { useCanonUiStore } from "@/stores/ui/canon";

describe("CanonArcs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    arcs.value = [{ id: "a1", name: "The drowned god" }, { id: "a2", name: "The guild" }];
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

  // Bug caught (#1255 item 11): Clear on the arc also wiping the search the DM had typed.
  it("clearing the arc leaves the page's search alone", async () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    store.query = "river";
    const w = mount(CanonArcs);
    await w.find("[data-testid=arc-clear]").trigger("click");
    expect(store.query).toBe("river");
  });

  // Bug caught: a deleted arc staying chosen, so every part is narrowed to nothing with no way to see why.
  it("lets go of an arc that is gone", async () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    mount(CanonArcs);
    arcs.value = [arcs.value[1]!];
    await flushPromises();
    expect(store.arcFilter).toBeNull();
  });

  // Bug caught: the old "Manage arcs" dialog surviving beside the chapter, a second place to make arcs.
  it("is only the picker: no arcs, nothing drawn, and no manage button", () => {
    expect(mount(CanonArcs).find("[data-testid=arcs-toggle]").exists()).toBe(false);
    arcs.value = [];
    expect(mount(CanonArcs).find("[data-testid=canon-arcs]").exists()).toBe(false);
  });
});
