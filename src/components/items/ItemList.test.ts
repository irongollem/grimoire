import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref, reactive } from "vue";
import ItemList from "./ItemList.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import type { Item } from "@/types/item.types";
import type { ItemScope } from "@/lib/items/itemScope";

// Wrapped in `reactive()`, exactly like a real Pinia store: `storeToRefs`
// (ItemList uses it for activeCampaignId) only picks up properties that are
// already refs on a reactive object, not on a plain object literal.
const activeCampaignId = ref<string | null>("campaign-1");
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => reactive({ activeCampaignId }),
}));

/**
 * happy-dom's IntersectionObserver never fires without a real layout, which is
 * exactly what these tests want: `visibleItems` stays pinned at the first
 * `useInfiniteScroll` page (48) so "select all shown" can be asserted against
 * the full filtered set, not just what's painted.
 */
class IntersectionObserverStub {
  observe() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

// A plain array, not a ref: vi.hoisted's callback runs before any import in
// this file (including "vue") is initialized, so calling ref() inside it
// throws a TDZ error. The mocked useItems below wraps this in a real ref at
// call time instead, which is late enough for "vue" to be bound.
const mocks = vi.hoisted(() => ({ items: [] as Item[] }));
vi.mock("@/composables/items/useItems", () => ({
  useItems: () => ({ data: ref(mocks.items), isLoading: ref(false) }),
}));
// Sidesteps useScrollRestore's onBeforeRouteLeave, which needs an installed
// router — irrelevant to the bulk-selection wiring under test here.
vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: undefined, linkCount: vi.fn() }),
}));

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "user-1",
    name: "Test Item",
    item_type: "gear",
    subtype: null,
    rarity: "common",
    requires_attunement: false,
    attunement_requirements: null,
    weight: null,
    cost: null,
    damage_rolls: null,
    armor_class: null,
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    description: "",
    source: null,
    tags: [],
    image_url: null,
    is_arcane_focus: false,
    mundane_description: null,
    mundane_image_url: null,
    curse_description: null,
    campaign_id: null,
    dm_notes: null,
    content: null,
    content_player_writable: false,
    content_updated_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const globalStubs = { stubs: { RouterLink: RouterLinkStub } };

function mountList(
  props: Partial<{
    selecting: boolean;
    selectedIds: ReadonlySet<string>;
    scopeFilter: ItemScope | "";
    showAllScopes: boolean;
  }> = {},
) {
  return mount(ItemList, {
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
}

describe("ItemList — bulk selection (#875)", () => {
  beforeEach(() => {
    mocks.items = [];
    activeCampaignId.value = "campaign-1";
  });

  it("excludes a non-UUID library/reference row from selectableIds", () => {
    mocks.items = [
      makeItem({ id: "11111111-1111-4111-8111-111111111111", name: "Owned Sword" }),
      makeItem({ id: "srd_owlbear_feather", name: "Owlbear Feather" }),
    ];
    const wrapper = mountList();
    expect(wrapper.vm.selectableIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("selectableIds covers every filtered row, not only the visible/painted window", () => {
    mocks.items = Array.from({ length: 60 }, (_, i) =>
      makeItem({
        id: `11111111-${String(i).padStart(4, "0")}-4111-8111-111111111111`,
        name: `Item ${i}`,
      }),
    );
    const wrapper = mountList();
    expect(wrapper.vm.selectableIds).toHaveLength(60);
    // The grid itself only painted the first useInfiniteScroll page.
    expect(wrapper.findAllComponents(BulkSelectableCard)).toHaveLength(48);
  });

  it("wraps a DM-owned row's card with selecting on, but a library row's with selecting off", () => {
    mocks.items = [
      makeItem({ id: "11111111-1111-4111-8111-111111111111", name: "Owned Sword" }),
      makeItem({ id: "srd_owlbear_feather", name: "Owlbear Feather" }),
    ];
    const wrapper = mountList({ selecting: true });
    const cards = wrapper.findAllComponents(BulkSelectableCard);
    expect(cards).toHaveLength(2);
    expect(cards[0].props("selecting")).toBe(true);
    expect(cards[1].props("selecting")).toBe(false);
  });

  it("in select mode an owned row shows neither Edit nor the Reference badge, a library row keeps Reference", () => {
    mocks.items = [
      makeItem({ id: "11111111-1111-4111-8111-111111111111", name: "Owned Sword" }),
      makeItem({ id: "srd_owlbear_feather", name: "Owlbear Feather" }),
    ];
    const wrapper = mountList({ selecting: true });
    const [owned, library] = wrapper.findAllComponents(BulkSelectableCard);
    expect(owned.find('a[href*="edit=true"]').exists()).toBe(false);
    expect(owned.text()).not.toContain("Reference");
    expect(library.text()).toContain("Reference");
  });

  it("does not enter selecting mode for any row when the list-wide flag is off", () => {
    mocks.items = [makeItem({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = mountList({ selecting: false });
    expect(wrapper.findComponent(BulkSelectableCard).props("selecting")).toBe(false);
  });

  it("reflects selectedIds onto the matching card's selected prop", () => {
    mocks.items = [
      makeItem({ id: "11111111-1111-4111-8111-111111111111" }),
      makeItem({ id: "22222222-2222-4222-8222-222222222222" }),
    ];
    const wrapper = mountList({
      selecting: true,
      selectedIds: new Set(["22222222-2222-4222-8222-222222222222"]),
    });
    const cards = wrapper.findAllComponents(BulkSelectableCard);
    expect(cards[0].props("selected")).toBe(false);
    expect(cards[1].props("selected")).toBe(true);
  });

  it("toggling a card emits toggle-select with that row's id", async () => {
    mocks.items = [makeItem({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = mountList({ selecting: true });
    await wrapper.findComponent(BulkSelectableCard).vm.$emit("toggle");
    expect(wrapper.emitted("toggle-select")).toEqual([["11111111-1111-4111-8111-111111111111"]]);
  });

  it("hides the Edit button while selecting, so it never collides with the checkbox chip", () => {
    mocks.items = [makeItem({ id: "11111111-1111-4111-8111-111111111111" })];
    const notSelecting = mountList({ selecting: false });
    expect(notSelecting.find('[aria-label="Edit"]').exists()).toBe(true);

    const selecting = mountList({ selecting: true });
    expect(selecting.find('[aria-label="Edit"]').exists()).toBe(false);
  });
});

describe("ItemList — scope filter", () => {
  beforeEach(() => {
    activeCampaignId.value = "campaign-1";
    mocks.items = [
      makeItem({ id: "11111111-1111-4111-8111-111111111111", name: "Campaign Sword", campaign_id: "campaign-1" }),
      makeItem({ id: "22222222-2222-4222-8222-222222222222", name: "General Cloak", campaign_id: null }),
      makeItem({ id: "33333333-3333-4333-8333-333333333333", name: "Foreign Ring", campaign_id: "campaign-other" }),
      makeItem({ id: "srd_owlbear_feather", name: "Owlbear Feather", campaign_id: null }),
    ];
  });

  it("shows every row when no scope is chosen", () => {
    const wrapper = mountList({ scopeFilter: "" });
    expect(wrapper.text()).toContain("Campaign Sword");
    expect(wrapper.text()).toContain("General Cloak");
    expect(wrapper.text()).toContain("Foreign Ring");
    expect(wrapper.text()).toContain("Owlbear Feather");
  });

  it('"This campaign" keeps only the row scoped to the active campaign', () => {
    const wrapper = mountList({ scopeFilter: "campaign" });
    expect(wrapper.text()).toContain("Campaign Sword");
    expect(wrapper.text()).not.toContain("General Cloak");
    expect(wrapper.text()).not.toContain("Foreign Ring");
    expect(wrapper.text()).not.toContain("Owlbear Feather");
  });

  it('"General" keeps only the DM\'s own campaign_id-null row, not the library row', () => {
    const wrapper = mountList({ scopeFilter: "general" });
    expect(wrapper.text()).toContain("General Cloak");
    expect(wrapper.text()).not.toContain("Campaign Sword");
    expect(wrapper.text()).not.toContain("Foreign Ring");
    expect(wrapper.text()).not.toContain("Owlbear Feather");
  });

  it('"Library" keeps only the non-UUID row', () => {
    const wrapper = mountList({ scopeFilter: "library" });
    expect(wrapper.text()).toContain("Owlbear Feather");
    expect(wrapper.text()).not.toContain("Campaign Sword");
    expect(wrapper.text()).not.toContain("General Cloak");
    expect(wrapper.text()).not.toContain("Foreign Ring");
  });

  it('"Other campaigns" keeps only the row scoped to a different campaign', () => {
    const wrapper = mountList({ scopeFilter: "other_campaign", showAllScopes: true });
    expect(wrapper.text()).toContain("Foreign Ring");
    expect(wrapper.text()).not.toContain("Campaign Sword");
    expect(wrapper.text()).not.toContain("General Cloak");
    expect(wrapper.text()).not.toContain("Owlbear Feather");
  });
});
