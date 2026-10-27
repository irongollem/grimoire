import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { ItemBrowseRow } from "@/types/item.types";
import type { ItemBrowseFilters } from "./useItemBrowse";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ slugs: null as unknown }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: mocks.slugs, isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("pinia", async (orig) => ({ ...(await orig<typeof import("pinia")>()), storeToRefs: (s: unknown) => s }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: ref("camp-1") }) }));

import { useItemBrowse, ITEM_BROWSE_PAGE_SIZE } from "./useItemBrowse";

function row(i: number, over: Partial<ItemBrowseRow> = {}): ItemBrowseRow {
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
    source: null,
    source_title: null,
    source_document_key: "grimoire-bundled",
    ...over,
  };
}

/**
 * Stand-in for `browse_items`: a catalogue it filters and pages the way the
 * server does. A filter the server takes as null ("no filter") but the client
 * sent as "" would match nothing here, as it would there.
 */
function serve(catalogue: ItemBrowseRow[]) {
  fake.onRpc("browse_items", (args) => {
    const campaign = args.p_campaign_id as string | null;
    const type = args.p_type as string | null;
    const search = args.p_search as string | null;
    const matching = catalogue.filter(
      (r) =>
        (r.campaign_id === null || r.campaign_id === campaign) &&
        (type === null || r.item_type === type) &&
        (search === null || r.name.toLowerCase().includes(search.toLowerCase())),
    );
    const offset = Number(args.p_offset);
    const rows = matching.slice(offset, offset + Number(args.p_limit));
    return offset === 0
      ? { rows, total: matching.length, selectable_ids: ["own-1"], sources: [{ slug: "srd-2024", title: "SRD 2024" }] }
      : { rows };
  });
}

const gear = (count: number) => Array.from({ length: count }, (_, i) => row(i));

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
    fake.reset();
    mocks.slugs = ref<string[] | null>(["srd-2024"]);
  });

  it("does not query until the enabled sources are known", async () => {
    mocks.slugs = ref(null);
    const { result } = mountBrowse();
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(result.error.value).toBeNull();
  });

  it("with no filters set reads the whole catalogue, with its total, selectable ids and sources", async () => {
    serve(gear(3));
    const { result } = mountBrowse();
    await flushPromises();
    expect(result.rows.value).toHaveLength(3);
    expect(result.total.value).toBe(3);
    expect(result.selectableIds.value).toEqual(["own-1"]);
    expect(result.sources.value).toEqual([{ slug: "srd-2024", title: "SRD 2024" }]);
    expect(result.hasNextPage.value).toBe(false);
  });

  it("offers general items and the active campaign's own, never another campaign's", async () => {
    serve([row(0), row(1, { campaign_id: "camp-1" }), row(2, { campaign_id: "camp-2" })]);
    const { result } = mountBrowse();
    await flushPromises();
    expect(result.rows.value.map((r) => r.id)).toEqual(["item-0", "item-1"]);
  });

  it("stops on an empty page instead of asking for the same offset again", async () => {
    // The first page is full and the total claims more, but nothing follows it.
    fake.onRpc("browse_items", (args) =>
      Number(args.p_offset) === 0 ? { rows: gear(ITEM_BROWSE_PAGE_SIZE), total: 100 } : { rows: [] },
    );
    const { result } = mountBrowse();
    await flushPromises();
    await result.fetchNextPage();
    await flushPromises();
    expect(result.hasNextPage.value).toBe(false);
  });

  it("pages by offset and flattens the pages in order", async () => {
    serve(gear(60));
    const { result } = mountBrowse();
    await flushPromises();
    expect(result.hasNextPage.value).toBe(true);

    await result.fetchNextPage();
    await flushPromises();
    expect(result.rows.value.map((r) => r.id)).toEqual(gear(60).map((r) => r.id));
    expect(result.total.value).toBe(60);
    expect(result.hasNextPage.value).toBe(false);
  });

  it("applies the filters, and waits for the search text to settle before asking", async () => {
    vi.useFakeTimers();
    try {
      serve([row(0, { item_type: "weapon", name: "Axe" }), row(1, { item_type: "weapon", name: "Sword" }), row(2)]);
      const filters = ref<ItemBrowseFilters>({ ...NO_FILTERS, type: "weapon" });
      const { result } = mountBrowse(() => filters.value);
      await vi.advanceTimersByTimeAsync(0);
      expect(result.rows.value.map((r) => r.name)).toEqual(["Axe", "Sword"]);

      fake.calls.length = 0;
      filters.value = { ...filters.value, search: " axe " };
      await vi.advanceTimersByTimeAsync(100);
      expect(fake.calls).toEqual([]);
      await vi.advanceTimersByTimeAsync(300);
      expect(result.rows.value.map((r) => r.name)).toEqual(["Axe"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces an rpc error instead of reading it as an empty catalogue", async () => {
    fake.failNext("browse_items", { message: "boom" });
    const { result } = mountBrowse();
    await vi.waitFor(() => expect(result.error.value).not.toBeNull());
    expect(result.rows.value).toEqual([]);
  });
});
