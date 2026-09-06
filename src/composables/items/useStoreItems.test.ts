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

/** Imported after the mocks so the composable picks them up. */
import type { RawStoreItemRow } from "@/composables/items/useStoreItems";
const { useSharedStoreItems, resolveStoreItemRow } = await import("@/composables/items/useStoreItems");

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
