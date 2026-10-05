import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useLootPool } from "./useLootPool";

const state = vi.hoisted(() => ({ ids: [] as string[][] }));

vi.mock("@/composables/items/useItemIndex", () => ({
  useItemIndex: () => ({
    data: { value: [{ id: "a", name: "Rope", image_url: null, rarity: "common", item_type: "gear" }] },
    isLoading: { value: false },
  }),
}));
vi.mock("@/composables/items/useStoredItemRefs", () => ({
  useStoredItemRefs: (getIds: () => string[]) => {
    state.ids.push(getIds());
    return {
      items: computed(() => [
        { id: "a", name: "Rope (stored)", image_url: null, rarity: "common", item_type: "gear" },
        { id: "gone", name: "Disabled Blade", image_url: null, rarity: "rare", item_type: "weapon" },
      ]),
    };
  },
}));

describe("useLootPool", () => {
  it("offers only the index, but resolves stored entries by id on top of it", () => {
    const entryIds = ref(["gone"]);
    const { itemsById, itemOptions } = useLootPool(() => entryIds.value);

    expect(state.ids[0]).toEqual(["gone"]);
    expect(itemOptions.value).toEqual([{ id: "a", name: "Rope" }]);
    expect(itemsById.value.get("gone")?.name).toBe("Disabled Blade");
    // A stored row wins over the index row of the same id.
    expect(itemsById.value.get("a")?.name).toBe("Rope (stored)");
  });
});
