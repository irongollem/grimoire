import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ addYield: vi.fn(), removeYield: vi.fn() }));
const state = vi.hoisted(() => ({ yields: [] as unknown[] }));
vi.mock("@/composables/canon/useCampaignSpecies", () => ({ useSpeciesEditing: () => ({ yields: ref(state.yields), addYield: mocks.addYield, removeYield: mocks.removeYield }) }));
vi.mock("@/composables/items/useItemIndex", () => ({
  useItemIndex: () => ({ data: ref([{ id: "own-1", name: "Rime pelt", is_shared: false }, { id: "lib_gall", name: "Oak gall", is_shared: true }]) }),
}));

import SpeciesYields from "./SpeciesYields.vue";

const species = { id: "s1", name: "Rime bear", scientificName: null, cladeId: null, kingdom: "animal" as const, livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0 };
const EntityComboboxStub = { props: ["modelValue", "options"], emits: ["update:modelValue", "open"], template: "<ul><li v-for='o in options' :key='o.id' :data-id='o.id' @click=\"$emit('update:modelValue', o.id)\">{{ o.name }}</li></ul>" };
const mountIt = () => mount(SpeciesYields, { props: { species }, global: { stubs: { EntityCombobox: EntityComboboxStub } } });

describe("SpeciesYields", () => {
  beforeEach(() => {
    mocks.addYield.mockReset().mockResolvedValue(undefined);
    mocks.removeYield.mockReset();
    state.yields = [{ id: "y1", speciesId: "s1", itemId: "own-1", libraryItemId: null, note: "from the hide", sortOrder: 0 }, { id: "y2", speciesId: "other", itemId: "own-1", libraryItemId: null, note: null, sortOrder: 0 }];
  });

  // Bug: another species' yields were listed, or the row showed no name for an item.
  it("lists this species' yields by item name with their notes, and offers only items not yet yielded", () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=species-yield]")).toHaveLength(1);
    expect(w.get("[data-testid=species-yield]").text()).toContain("Rime pelt");
    expect(w.get("[data-testid=species-yield]").text()).toContain("from the hide");
    expect(w.findAll("li[data-id]").map((o) => o.attributes("data-id"))).toEqual(["lib_gall"]);
  });

  // Bug: a book's item was saved as the DM's own (item_id), which the database refuses as a missing row.
  it("files a book's item as the library's and carries the typed note, trimmed", async () => {
    const w = mountIt();
    await w.get("input[aria-label='A note on what it yields']").setValue("  in the gall  ");
    await w.get("li[data-id=lib_gall]").trigger("click");
    await flushPromises();
    expect(mocks.addYield).toHaveBeenCalledExactlyOnceWith("s1", { itemId: null, libraryItemId: "lib_gall", note: "in the gall" });
  });

  it("removes the row's own yield", async () => {
    await mountIt().get("[data-testid=remove-yield]").trigger("click");
    expect(mocks.removeYield).toHaveBeenCalledExactlyOnceWith("y1");
  });
});
