import { defineComponent, h, ref, shallowRef, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Item } from "@/types/item.types";

/** Just the two fields the resolver reads off a projected item. */
type ProjectedItem = Pick<Item, "id" | "name">;

const mocks = vi.hoisted(() => ({
  /** Rows `store_items` hands back for the location under test. */
  rows: [] as { id: string; item_id: string }[],
  /** Set by the mock factory, so writes to it are reactive. */
  projection: null as Ref<ProjectedItem[]> | null,
  refetches: 0,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ data: mocks.rows, error: null }),
        }),
      }),
    }),
  },
  getCurrentUser: () => ({ id: "player-1" }),
}));

vi.mock("@/composables/items/useItems", () => {
  const projection = shallowRef<ProjectedItem[]>([]);
  mocks.projection = projection;
  return {
    usePlayerVisibleItems: () => ({
      data: projection,
      isLoading: ref(false),
      refetch: async () => {
        mocks.refetches += 1;
      },
    }),
  };
});

/** Imported after the mocks so the composable picks them up. */
const { useSharedStoreItems } = await import("@/composables/items/useStoreItems");

/** Mounts a panel that records the ware names it would render, per update. */
function mountPanel() {
  const seen: (string | null)[][] = [];
  mount(
    defineComponent({
      setup() {
        const { data } = useSharedStoreItems(ref("loc-1"));
        return () => {
          seen.push((data.value ?? []).map((row) => row.item?.name ?? null));
          return h("div");
        };
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return seen;
}

describe("useSharedStoreItems", () => {
  beforeEach(() => {
    mocks.rows = [
      { id: "row-owned", item_id: "item-owned" },
      { id: "row-ware", item_id: "item-ware" },
    ];
    // The snapshot a player's page loaded with: their vault, and no shop.
    mocks.projection!.value = [{ id: "item-owned", name: "Tanned Leather" }];
    mocks.refetches = 0;
  });

  it("refetches the projection when a ware it does not know appears", async () => {
    const seen = mountPanel();
    await flushPromises();

    expect(seen.at(-1)).toEqual(["Tanned Leather", null]);
    expect(mocks.refetches).toBe(1);
  });

  it("resolves the ware once the projection catches up", async () => {
    const seen = mountPanel();
    await flushPromises();

    mocks.projection!.value = [
      { id: "item-owned", name: "Tanned Leather" },
      { id: "item-ware", name: "Studded Leather" },
    ];
    await flushPromises();

    expect(seen.at(-1)).toEqual(["Tanned Leather", "Studded Leather"]);
  });

  it("asks once per item, so an item that can never resolve is not a refetch loop", async () => {
    mountPanel();
    await flushPromises();
    expect(mocks.refetches).toBe(1);

    // A refetch that does not help: the projection filters by ruleset and
    // campaign scope client-side, so a ware outside either stays absent.
    mocks.projection!.value = [{ id: "item-owned", name: "Tanned Leather" }];
    await flushPromises();

    expect(mocks.refetches).toBe(1);
  });
});
