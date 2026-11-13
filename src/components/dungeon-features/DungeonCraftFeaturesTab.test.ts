import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import DungeonCraftFeaturesTab from "./DungeonCraftFeaturesTab.vue";
import { useLowArt } from "@/composables/useLowArt";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import { useListLayout } from "@/composables/useListLayout";

useVirtualGridViewport({ viewportPx: 1000000, itemPx: 200 });

const features = [
  {
    id: "f1", name: "Sticky Lever", feature_type: "Mechanism", trigger_type: "Pull", perception_dc: 14,
    object_ac: null, image_url: "https://x/lever.webp", image_focal_point: null, tags: [],
  },
];

vi.mock("@/composables/dungeon-features/useDungeonFeatures", () => ({
  useDungeonFeatureIndex: () => ({ data: ref(features), isLoading: ref(false) }),
}));
vi.mock("@/composables/dungeon-features/usePlacedInRooms", () => ({
  usePlacedInRooms: () => ({ placedInRows: () => [] }),
}));
vi.mock("@/composables/campaign/useMoveToCampaignFlow", () => ({ useMoveToCampaignFlow: () => ({ moving: ref(false), move: vi.fn() }) }));
vi.mock("@/composables/campaign/useCopyToCampaignFlow", () => ({
  useCopyToCampaignFlow: () => ({ copyOpen: ref(false), copyIds: ref([]), onCopied: vi.fn(), onQuotaExceeded: vi.fn(), openCopy: vi.fn() }),
}));
vi.mock("@/composables/library/useEnabledSources", () => ({ useDungeonCraftBooksOffered: () => ref(false) }));
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: () => null }) }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()), useAbove: () => ref(true) }));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ quota: ref(null) }) }));
vi.mock("@/lib/placeholderFocalPoints", () => ({
  placeholderUrl: () => "/p.webp",
  initPlaceholderFocalPoints: vi.fn().mockResolvedValue(undefined),
  getPlaceholderFocalPoint: vi.fn(),
}));

async function mountTab() {
  const w = mount(DungeonCraftFeaturesTab, { global: { stubs: { RouterLink: RouterLinkStub, AiImageBadge: true } } });
  await flushPromises();
  return w;
}

describe("DungeonCraftFeaturesTab low art", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => {
    useLowArt().setLowArt(false);
    useListLayout("dungeon-features", "grid").value = "grid";
  });

  // Bug: the features grid still downloads each feature's picture in low art.
  it("draws art-free cards with the type as the eyebrow and no picture", async () => {
    useLowArt().setLowArt(true);
    // A stored layout wins over low art's default of rows, so pick the grid.
    useListLayout("dungeon-features", "grid").value = "grid";
    const w = await mountTab();
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("Sticky Lever");
    expect(w.text()).toContain("Mechanism");
    expect(w.text()).toContain("Pull · Perc 14");
  });

  // Bug: rows in low art lose the ledger heads, or still show the thumbnail.
  it("draws the rows as a ledger with its column heads", async () => {
    useLowArt().setLowArt(true);
    useListLayout("dungeon-features", "grid").value = "rows";
    const w = await mountTab();
    expect(w.find("[data-ledger-head]").text()).toContain("Details");
    expect(w.find("img").exists()).toBe(false);
  });

  // Bug: the Dungeon Craft card keeps a hand-rolled twin for art mode beside EntityGridCard.
  it("draws the art-mode card as EntityGridCard with the picture and the type on the plate", async () => {
    const w = await mountTab();
    const card = w.findComponent(EntityGridCard);
    expect(card.props("imageUrl")).toBe("https://x/lever.webp");
    expect(card.props("badgeText")).toBe("Mechanism");
    expect(w.find("[data-art-free]").exists()).toBe(false);
    expect(w.find("img").exists()).toBe(true);
  });
});
