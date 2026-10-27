import { computed, defineComponent, h, ref, shallowRef, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Item } from "@/types/item.types";

/** Just the two fields the resolver reads off a projected item. */
type ProjectedItem = Pick<Item, "id" | "name">;

const OWNED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WARE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const mocks = vi.hoisted(() => ({
  /** Set by the mock factory, so writes to it are reactive. */
  projection: null as Ref<ProjectedItem[]> | null,
  /** Whether the projection is still loading; set by the mock factory. */
  loading: null as Ref<boolean> | null,
  refetches: 0,
}));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "player-1" }) }));

vi.mock("@/composables/items/useItems", () => {
  const projection = shallowRef<ProjectedItem[]>([]);
  const loading = ref(false);
  mocks.projection = projection;
  mocks.loading = loading;
  return {
    usePlayerItemProjection: () => ({
      data: projection,
      isLoading: loading,
      refetch: async () => {
        mocks.refetches += 1;
      },
    }),
    // Mirrors the real normalizeLibraryItem's patch-in-the-missing-columns
    // shape closely enough for resolveStoreItemRow's own tests below.
    normalizeLibraryItem: (row: Record<string, unknown>) => ({
      ...row,
      user_id: "",
      campaign_id: null,
      dm_notes: null,
      spell_ids: [],
      content: null,
      content_player_writable: false,
      content_updated_at: null,
    }),
  };
});

// The resolver itself is covered in useStoredItemRefs; here it resolves in the projection alone.
vi.mock("@/composables/items/useStoredItemRefs", () => ({
  useStoredItemRefs: (_ids: unknown, source: Ref<ProjectedItem[] | undefined>) => ({
    items: computed(() => source.value ?? []),
    isLoading: ref(false),
  }),
}));

/** Imported after the mocks so the composable picks them up. */
import type { RawStoreItemRow } from "@/composables/items/useStoreItems";
const {
  useSharedStoreItems,
  useStoreStockCounts,
  useAddStoreItem,
  useAddStoreItems,
  useUpdateStoreItem,
  useRemoveStoreItem,
  resolveStoreItemRow,
} = await import("@/composables/items/useStoreItems");

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
    fake.reset();
    fake.seed("store_items", [
      { id: "row-owned", location_id: "loc-1", item_id: OWNED, sort_order: 0 },
      { id: "row-ware", location_id: "loc-1", item_id: WARE, sort_order: 1 },
      { id: "row-elsewhere", location_id: "loc-2", item_id: WARE, sort_order: 0 },
    ]);
    // The snapshot a player's page loaded with: their vault, and no shop.
    mocks.projection!.value = [{ id: OWNED, name: "Tanned Leather" }];
    mocks.refetches = 0;
    mocks.loading!.value = false;
  });

  it("lists this shop's wares in sort order, and not another shop's", async () => {
    fake.seed("store_items", [{ id: "row-first", location_id: "loc-1", item_id: OWNED, sort_order: -1 }]);
    let ids: string[] = [];
    mount(
      defineComponent({
        setup() {
          const { data } = useSharedStoreItems(ref("loc-1"));
          return () => {
            ids = (data.value ?? []).map((row) => row.id);
            return h("div");
          };
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    );
    await flushPromises();
    expect(ids).toEqual(["row-first", "row-owned", "row-ware"]);
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
      { id: OWNED, name: "Tanned Leather" },
      { id: WARE, name: "Studded Leather" },
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
    mocks.projection!.value = [{ id: OWNED, name: "Tanned Leather" }];
    await flushPromises();

    expect(mocks.refetches).toBe(1);
  });
});

describe("useSharedStoreItems refetch rules", () => {
  beforeEach(() => {
    fake.reset();
    mocks.projection!.value = [{ id: OWNED, name: "Tanned Leather" }];
    mocks.loading!.value = false;
    mocks.refetches = 0;
  });

  it("does not refetch the projection for a library ware it cannot resolve, which the projection never holds", async () => {
    fake.seed("store_items", [
      { id: "row-library", location_id: "loc-1", item_id: null, library_item_id: "srd_unknown_ware", sort_order: 0 },
    ]);
    mountPanel();
    await flushPromises();
    expect(mocks.refetches).toBe(0);
  });

  it("waits for the projection to finish loading before judging a ware unresolved", async () => {
    mocks.loading!.value = true;
    fake.seed("store_items", [{ id: "row-ware", location_id: "loc-1", item_id: WARE, sort_order: 0 }]);
    mountPanel();
    await flushPromises();
    expect(mocks.refetches).toBe(0);

    mocks.loading!.value = false;
    await flushPromises();
    expect(mocks.refetches).toBe(1);
  });
});

describe("store item writes and counts", () => {
  function inClient<T>(setup: () => T): T {
    let out!: T;
    mount(
      defineComponent({
        setup() {
          out = setup();
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
    );
    return out;
  }

  beforeEach(() => {
    fake.reset();
    fake.seed("store_items", [
      { id: "a", location_id: "loc-1", visible: true },
      { id: "b", location_id: "loc-1", visible: false },
      { id: "c", location_id: "loc-2", visible: true },
      { id: "d", location_id: "loc-3", visible: true },
    ]);
  });

  it("counts stock only for the locations asked about", async () => {
    const q = inClient(() => useStoreStockCounts(ref(["loc-2", "loc-1"])));
    await vi.waitFor(() => expect(q.data.value?.map((r) => r.location_id).sort()).toEqual(["loc-1", "loc-1", "loc-2"]));
  });

  it("reads nothing for no locations", async () => {
    inClient(() => useStoreStockCounts(ref<string[]>([])));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("stocks a ware as the signed-in user", async () => {
    const add = inClient(() => useAddStoreItem());
    await add.mutateAsync({ location_id: "loc-1", item_id: WARE, library_item_id: null });
    expect(fake.rows("store_items").find((r) => r.item_id === WARE)).toMatchObject({ location_id: "loc-1", user_id: "player-1" });
  });

  it("quick-fills a shop with every row stamped with the signed-in user", async () => {
    const add = inClient(() => useAddStoreItems());
    await add.mutateAsync([
      { location_id: "loc-1", item_id: OWNED, library_item_id: null },
      { location_id: "loc-1", item_id: WARE, library_item_id: null },
    ]);
    const added = fake.rows("store_items").filter((r) => r.item_id === OWNED || r.item_id === WARE);
    expect(added).toHaveLength(2);
    expect(added.every((r) => r.user_id === "player-1")).toBe(true);
  });

  it("updates one ware and no other", async () => {
    const update = inClient(() => useUpdateStoreItem(ref("loc-1")));
    await update.mutateAsync({ id: "a", update: { price_override: "5 gp" } });
    expect(fake.rows("store_items").map((r) => r.price_override)).toEqual(["5 gp", undefined, undefined, undefined]);
  });

  it("removes one ware and no other", async () => {
    const remove = inClient(() => useRemoveStoreItem(ref("loc-1")));
    await remove.mutateAsync("a");
    expect(fake.rows("store_items").map((r) => r.id)).toEqual(["b", "c", "d"]);
  });
});

describe("resolveStoreItemRow", () => {
  /** A row referencing the owner's own vault item — the `items(*)` embed
   *  resolves it, `library_items(*)` comes back null. */
  function vaultRow(): RawStoreItemRow {
    return {
      id: "row-1", user_id: "u1", location_id: "loc-1",
      item_id: "item-1", library_item_id: null,
      price_override: null, visible: true, sort_order: 0,
      created_at: "", updated_at: "",
      item: { id: "item-1", name: "Tanned Leather" } as unknown as RawStoreItemRow["item"],
      library_item: null,
    };
  }

  it("keeps the items(*) embed when the row references a vault item", () => {
    const resolved = resolveStoreItemRow(vaultRow());
    expect(resolved.item?.name).toBe("Tanned Leather");
    expect(resolved.item_id).toBe("item-1");
    expect(resolved.library_item_id).toBeNull();
  });

  it("resolves via the library_items(*) embed when the row references shared content (#819)", () => {
    const row: RawStoreItemRow = {
      ...vaultRow(),
      item_id: null,
      library_item_id: "srd_grimoire_bundled_leather_armour",
      item: null,
      library_item: { id: "srd_grimoire_bundled_leather_armour", name: "Leather Armour" },
    };
    const resolved = resolveStoreItemRow(row);
    expect(resolved.item?.name).toBe("Leather Armour");
    // normalizeLibraryItem's patch — proves the merge routes through it
    // rather than casting the raw library row directly.
    expect(resolved.item?.user_id).toBe("");
  });

  it("never renders a library-stocked row blank — both embeds null only means neither resolved yet, not that the item is missing", () => {
    const row: RawStoreItemRow = { ...vaultRow(), item_id: null, item: null, library_item: null };
    expect(resolveStoreItemRow(row).item).toBeNull();
  });
});
