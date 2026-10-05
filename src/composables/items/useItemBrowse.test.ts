import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { ItemBrowsePage, ItemBrowseRow } from "@/types/item.types";
import type { ItemBrowseFilters } from "./useItemBrowse";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  slugs: null as unknown,
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: mocks.slugs, isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("pinia", async (orig) => ({ ...(await orig<typeof import("pinia")>()), storeToRefs: (s: unknown) => s }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: ref("camp-1") }) }));

import { useItemBrowse, ITEM_BROWSE_PAGE_SIZE } from "./useItemBrowse";

function row(i: number): ItemBrowseRow {
  return {
    id: `item-${i}`,
    name: `Item ${i}`,
    item_type: "gear",
    rarity: "common",
    tags: [],
    image_url: null,
    image_focal_point: null,
    damage_rolls: null,
    armor_class: null,
    charges: null,
    has_content: false,
    campaign_id: null,
    is_shared: true,
  };
}

/** Only the first page carries the summary; later pages are rows alone. */
function laterPage(from: number, count: number): ItemBrowsePage {
  return { rows: Array.from({ length: count }, (_, i) => row(from + i)) };
}

function page(from: number, count: number, total: number): ItemBrowsePage {
  return {
    rows: Array.from({ length: count }, (_, i) => row(from + i)),
    total,
    selectable_ids: ["own-1"],
    sources: [{ slug: "srd-2024", title: "SRD 2024" }],
  };
}

const NO_FILTERS: ItemBrowseFilters = { search: "", type: "", rarity: "", source: "", scope: "" };

function mountBrowse(filters: () => ItemBrowseFilters = () => NO_FILTERS) {
  let result!: ReturnType<typeof useItemBrowse>;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useItemBrowse(filters);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return { wrapper, result };
}

describe("useItemBrowse (#972)", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.slugs = ref<string[] | null>(["srd-2024"]);
  });

  it("does not query until the enabled sources are known", async () => {
    mocks.slugs = ref(null);
    mountBrowse();
    await flushPromises();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("asks browse_items for page 1 with empty filters sent as null", async () => {
    mocks.rpc.mockResolvedValue({ data: page(0, 3, 3), error: null });
    const { result } = mountBrowse();
    await flushPromises();
    expect(mocks.rpc).toHaveBeenCalledWith("browse_items", {
      p_slugs: ["srd-2024"],
      p_ruleset: "2024",
      p_campaign_id: "camp-1",
      p_search: null,
      p_type: null,
      p_rarity: null,
      p_source: null,
      p_scope: null,
      p_limit: ITEM_BROWSE_PAGE_SIZE,
      p_offset: 0,
    });
    expect(result.rows.value).toHaveLength(3);
    expect(result.total.value).toBe(3);
    expect(result.selectableIds.value).toEqual(["own-1"]);
    expect(result.sources.value).toEqual([{ slug: "srd-2024", title: "SRD 2024" }]);
    expect(result.hasNextPage.value).toBe(false);
  });

  it("stops on an empty page instead of asking for the same offset again", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: page(0, ITEM_BROWSE_PAGE_SIZE, 100), error: null })
      .mockResolvedValueOnce({ data: laterPage(ITEM_BROWSE_PAGE_SIZE, 0), error: null });
    const { result } = mountBrowse();
    await flushPromises();
    await result.fetchNextPage();
    await flushPromises();
    expect(result.hasNextPage.value).toBe(false);
  });

  it("pages by offset and flattens the pages in order", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: page(0, ITEM_BROWSE_PAGE_SIZE, 60), error: null })
      .mockResolvedValueOnce({ data: laterPage(ITEM_BROWSE_PAGE_SIZE, 12), error: null });
    const { result } = mountBrowse();
    await flushPromises();
    expect(result.hasNextPage.value).toBe(true);

    await result.fetchNextPage();
    await flushPromises();
    expect(mocks.rpc.mock.calls[1][1].p_offset).toBe(ITEM_BROWSE_PAGE_SIZE);
    expect(result.rows.value).toHaveLength(60);
    expect(result.rows.value[59].id).toBe("item-59");
    expect(result.total.value).toBe(60);
    expect(result.hasNextPage.value).toBe(false);
  });

  it("sends the filters, and debounces the search text", async () => {
    vi.useFakeTimers();
    try {
      mocks.rpc.mockResolvedValue({ data: page(0, 1, 1), error: null });
      const filters = ref<ItemBrowseFilters>({ ...NO_FILTERS, type: "weapon", scope: "general" });
      mountBrowse(() => filters.value);
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_type: "weapon", p_scope: "general", p_search: null });

      mocks.rpc.mockClear();
      filters.value = { ...filters.value, search: " axe " };
      await vi.advanceTimersByTimeAsync(100);
      expect(mocks.rpc).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300);
      expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_search: "axe" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces an rpc error instead of reading it as an empty catalogue", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const { result } = mountBrowse();
    await vi.waitFor(() => expect(result.error.value).toBeInstanceOf(Error));
    expect(result.rows.value).toEqual([]);
  });
});
