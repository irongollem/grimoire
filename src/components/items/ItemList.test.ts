import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref, computed } from "vue";
import ItemList from "./ItemList.vue";
import { useListLayout } from "@/composables/useListLayout";
import { IconDocument } from "@/lib/icons";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import type { ItemBrowseFilters } from "@/composables/items/useItemBrowse";
import type { ItemBrowseRow } from "@/types/item.types";

/**
 * happy-dom's IntersectionObserver never fires without a real layout, so the
 * sentinel never asks for another page on its own; the paging tests drive
 * `fetchNextPage` through the mocked composable instead.
 */
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  selectableIds: [] as string[],
  sources: [] as { slug: string; title: string | null }[],
  loading: false,
  error: null as Error | null,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  lastFilters: null as null | (() => unknown),
  savedCount: undefined as number | undefined,
  prefetch: vi.fn(),
}));

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (source: string | null | undefined, title?: string | null) => (source ? (title ?? source) : null),
  }),
}));

vi.mock("@/composables/items/useItemBrowse", () => ({
  useItemBrowse: (getFilters: () => unknown) => {
    mocks.lastFilters = getFilters;
    return {
      rows: computed(() => mocks.rows),
      selectableIds: computed(() => mocks.selectableIds),
      sources: computed(() => mocks.sources),
      ready: computed(() => !mocks.loading),
      isLoading: ref(mocks.loading),
      error: ref(mocks.error),
      hasNextPage: ref(mocks.hasNextPage),
      isFetchingNextPage: ref(false),
      fetchNextPage: mocks.fetchNextPage,
    };
  },
}));
vi.mock("@/composables/items/useItems", () => ({
  fetchResolvedItem: vi.fn(),
  resolvedItemKey: (id: string) => ["resolved-item", id],
}));
vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ prefetchQuery: mocks.prefetch }),
}));
// Sidesteps useScrollRestore's onBeforeRouteLeave, which needs an installed router.
vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: mocks.savedCount, linkCount: vi.fn() }),
}));

const OWNED = "11111111-1111-4111-8111-111111111111";

function makeItem(overrides: Partial<ItemBrowseRow> = {}): ItemBrowseRow {
  return {
    id: OWNED,
    name: "Test Item",
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
    is_shared: false,
    source: null,
    source_title: null,
    source_document_key: null,
    ...overrides,
  };
}

// EntityGridCard draws the AI chip itself (it reads provenance through TanStack Query,
// which these tests mount without).
const globalStubs = { stubs: { RouterLink: RouterLinkStub, AiImageBadge: true } };

// jsdom has no layout; see the helper for what this stands in for.
useVirtualGridViewport({ viewportPx: 1000000, itemPx: 200 });

async function mountList(
  props: Partial<{
    selecting: boolean;
    selectedIds: ReadonlySet<string>;
    scopeFilter: ItemBrowseFilters["scope"];
  }> = {},
) {
  const wrapper = mount(ItemList, {
    props: {
      search: "",
      typeFilter: "",
      rarityFilter: "",
      sourceFilter: "",
      scopeFilter: "",
      ...props,
    },
    global: globalStubs,
  });
  await flushPromises(); // VirtualGrid finds its scroller on mount, rows follow
  return wrapper;
}

describe("ItemList — bulk selection (#875)", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.selectableIds = [];
    mocks.loading = false;
    mocks.hasNextPage = false;
    mocks.savedCount = undefined;
    mocks.fetchNextPage.mockClear();
    mocks.prefetch.mockClear();
  });

  it("exposes the server's selectableIds, which are never a library row", async () => {
    mocks.rows = [makeItem({ name: "Owned Sword" }), makeItem({ id: "srd_owlbear_feather", name: "Owlbear Feather", is_shared: true })];
    mocks.selectableIds = [OWNED, "22222222-2222-4222-8222-222222222222"];
    const wrapper = await mountList();
    // Includes an own row that has not scrolled in yet: select-all is not bound to the painted page.
    expect(wrapper.vm.selectableIds).toEqual([OWNED, "22222222-2222-4222-8222-222222222222"]);
  });

  it("paints every row it was given, one card each", async () => {
    mocks.rows = Array.from({ length: 60 }, (_, i) =>
      makeItem({ id: `11111111-${String(i).padStart(4, "0")}-4111-8111-111111111111`, name: `Item ${i}` }),
    );
    const wrapper = await mountList();
    expect(wrapper.findAllComponents(BulkSelectableCard)).toHaveLength(60);
  });

  it("wraps a DM-owned row's card with selecting on, but a library row's with selecting off", async () => {
    mocks.rows = [
      makeItem({ id: "11111111-1111-4111-8111-111111111111", name: "Owned Sword" }),
      makeItem({ id: "srd_owlbear_feather", name: "Owlbear Feather", is_shared: true }),
    ];
    const wrapper = await mountList({ selecting: true });
    const cards = wrapper.findAllComponents(BulkSelectableCard);
    expect(cards).toHaveLength(2);
    expect(cards[0].props("selecting")).toBe(true);
    expect(cards[1].props("selecting")).toBe(false);
  });

  it("in select mode an owned row shows no Edit and no book, a library row names its book", async () => {
    mocks.rows = [
      makeItem({ id: "11111111-1111-4111-8111-111111111111", name: "Owned Sword" }),
      makeItem({
        id: "srd_owlbear_feather",
        name: "Owlbear Feather",
        is_shared: true,
        source: null,
        source_document_key: "grimoire-bundled",
        source_title: "Grimoire Equipment",
      }),
    ];
    const wrapper = await mountList({ selecting: true });
    const [owned, library] = wrapper.findAllComponents(BulkSelectableCard);
    expect(owned.find('[aria-label="Edit"]').exists()).toBe(false);
    expect(owned.text()).not.toContain("Grimoire Equipment");
    expect(library.text()).toContain("Grimoire Equipment");
    expect(library.text()).not.toContain("Reference");
  });

  it("does not enter selecting mode for any row when the list-wide flag is off", async () => {
    mocks.rows = [makeItem({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = await mountList({ selecting: false });
    expect(wrapper.findComponent(BulkSelectableCard).props("selecting")).toBe(false);
  });

  it("reflects selectedIds onto the matching card's selected prop", async () => {
    mocks.rows = [
      makeItem({ id: "11111111-1111-4111-8111-111111111111" }),
      makeItem({ id: "22222222-2222-4222-8222-222222222222" }),
    ];
    const wrapper = await mountList({
      selecting: true,
      selectedIds: new Set(["22222222-2222-4222-8222-222222222222"]),
    });
    const cards = wrapper.findAllComponents(BulkSelectableCard);
    expect(cards[0].props("selected")).toBe(false);
    expect(cards[1].props("selected")).toBe(true);
  });

  it("toggling a card emits toggle-select with that row's id", async () => {
    mocks.rows = [makeItem({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = await mountList({ selecting: true });
    await wrapper.findComponent(BulkSelectableCard).vm.$emit("toggle");
    expect(wrapper.emitted("toggle-select")).toEqual([["11111111-1111-4111-8111-111111111111"]]);
  });

  it("hides the Edit button while selecting, so it never collides with the checkbox chip", async () => {
    mocks.rows = [makeItem({ id: "11111111-1111-4111-8111-111111111111" })];
    const notSelecting = await mountList({ selecting: false });
    expect(notSelecting.find('[aria-label="Edit"]').exists()).toBe(true);

    const selecting = await mountList({ selecting: true });
    expect(selecting.find('[aria-label="Edit"]').exists()).toBe(false);
  });
});

describe("ItemList — filters, paging and prefetch (#972)", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.selectableIds = [];
    mocks.loading = false;
    mocks.hasNextPage = false;
    mocks.savedCount = undefined;
    mocks.fetchNextPage.mockClear();
    mocks.prefetch.mockClear();
  });

  it("hands the filter props to the browse composable", async () => {
    await mountList({ scopeFilter: "other_campaign" });
    expect(mocks.lastFilters?.()).toEqual({ search: "", type: "", rarity: "", source: "", scope: "other_campaign" });
  });

  it("exposes the sources the server reported", async () => {
    mocks.sources = [{ slug: "srd-2024", title: "SRD 2024" }];
    expect((await mountList()).vm.sources).toEqual([{ slug: "srd-2024", title: "SRD 2024" }]);
  });

  it("shows the empty state when no row matches", async () => {
    expect((await mountList()).text()).toContain("No items found");
  });

  it("shows the document icon only for a row with content", async () => {
    mocks.rows = [makeItem({ has_content: true })];
    expect((await mountList()).findComponent(IconDocument).exists()).toBe(true);
    mocks.rows = [makeItem({ has_content: false })];
    expect((await mountList()).findComponent(IconDocument).exists()).toBe(false);
  });

  it("prefetches the detail on pointer hover", async () => {
    mocks.rows = [makeItem()];
    const wrapper = await mountList();
    await wrapper.find(".contents").trigger("pointerover");
    expect(mocks.prefetch).toHaveBeenCalledTimes(1);
    expect(mocks.prefetch.mock.calls[0][0].queryKey).toEqual(["resolved-item", OWNED]);
  });

  it("keeps fetching pages until the saved scroll depth is back", async () => {
    mocks.rows = [makeItem()];
    mocks.hasNextPage = true;
    mocks.savedCount = 96;
    await mountList();
    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  it("does not fetch ahead when there is no saved depth", async () => {
    mocks.rows = [makeItem()];
    mocks.hasNextPage = true;
    await mountList();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });
});

describe("ItemList — empty and failed reads", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.loading = false;
    mocks.error = null;
  });

  it("invites a first item when nothing is filtered, and suggests loosening filters when something is", async () => {
    expect((await mountList()).text()).toContain("Add your first item to the vault.");
    for (const props of [{ search: "x" }, { typeFilter: "weapon" }, { rarityFilter: "rare" }, { sourceFilter: "srd" }, { scopeFilter: "other_campaign" as const }]) {
      const wrapper = mount(ItemList, { props: { search: "", typeFilter: "", rarityFilter: "", sourceFilter: "", scopeFilter: "", ...props }, global: globalStubs });
      await flushPromises();
      expect(wrapper.text(), JSON.stringify(props)).toContain("Try adjusting your filters.");
    }
  });

  it("says the vault could not be read, rather than showing an empty one", async () => {
    mocks.error = new Error("boom");
    const wrapper = await mountList();
    expect(wrapper.text()).toContain("Could not load items");
    expect(wrapper.text()).not.toContain("No items found");
  });
});

describe("ItemList — the one-per-row layout", () => {
  const layout = useListLayout("items", "grid");
  // The row layout windows by measured height: let a second pass mount the rows below the first.
  const settled = async (wrapper: Awaited<ReturnType<typeof mountList>>) => {
    for (let i = 0; i < 4; i += 1) await flushPromises();
    return wrapper;
  };
  beforeEach(() => {
    layout.value = "rows";
    mocks.rows = [
      makeItem({ id: OWNED, name: "Owned Sword" }),
      makeItem({ id: "srd_feather", name: "Owlbear Feather", is_shared: true, source_document_key: "grimoire-bundled", source_title: "Grimoire Equipment" }),
    ];
    mocks.loading = false;
    mocks.error = null;
    mocks.hasNextPage = false;
    mocks.savedCount = undefined;
  });
  afterEach(() => {
    layout.value = "grid";
  });

  it("makes only the DM's own rows selectable, as the card layout does", async () => {
    const wrapper = await mountList({ selecting: true });

    const [owned, library] = wrapper.findAllComponents(BulkSelectableCard);
    expect(owned.props("selecting")).toBe(true);
    expect(library.props("selecting")).toBe(false);
  });

  it("offers Edit on an own row and not on a library row, and hides it while selecting", async () => {
    const wrapper = await settled(await mountList({ selecting: false }));
    const [owned, library] = wrapper.findAllComponents(BulkSelectableCard);
    expect(owned.find('[aria-label="Edit"]').exists()).toBe(true);
    expect(library.find('[aria-label="Edit"]').exists()).toBe(false);
    const selecting = await settled(await mountList({ selecting: true }));
    expect(selecting.find('[aria-label="Edit"]').exists()).toBe(false);
  });

  it("puts the book first among a row's tags", async () => {
    mocks.rows = [makeItem({ id: "srd_feather", is_shared: true, tags: ["beast"], source_document_key: "grimoire-bundled", source_title: "Grimoire Equipment" })];
    const wrapper = await settled(await mountList());
    const text = wrapper.text();
    expect(text.indexOf("Grimoire Equipment")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Grimoire Equipment")).toBeLessThan(text.indexOf("beast"));
  });
});
