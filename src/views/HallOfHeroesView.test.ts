import { mount } from "@vue/test-utils";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HallOfHeroesView from "./HallOfHeroesView.vue";
import { useLowArt } from "@/composables/useLowArt";
import { useListLayout } from "@/composables/useListLayout";

const heroes = ref([
  { id: "h1", name: "Drizzt", race: "Drow", occupation: "Ranger", setting: "faerun", tags: ["hero"], portrait_url: "https://cdn.test/d.webp", portrait_focal_point: null },
]);
vi.mock("@/composables/party/useHallOfHeroes", () => ({
  useHallOfHeroes: () => ({ data: heroes, isLoading: ref(false) }),
  useDeleteHero: () => ({ mutate: vi.fn() }),
  useImportHero: () => ({ mutate: vi.fn() }),
  usePopulateAllSettingHeroes: () => ({ isPending: ref(false), error: ref(null), mutateAsync: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isAppAdmin: false }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { calendar_id: "faerun" } }),
}));
vi.mock("@/stores/ui/hall", () => ({
  useHallUiStore: () => ({
    hallOfHeroesSearch: "",
    hallOfHeroesFilterSetting: "all",
    hallOfHeroesHasActiveFilters: false,
    resetHallOfHeroesFilters: vi.fn(),
  }),
}));
vi.mock("@/composables/useScrollRestore", () => ({ useScrollRestore: () => ({}) }));
vi.mock("vue-router", async (orig) => ({ ...(await orig<typeof import("vue-router")>()), useRouter: () => ({ push: vi.fn() }) }));

useVirtualGridViewport();

describe("HallOfHeroesView in low art (#1179)", () => {
  beforeEach(() => {
    useLowArt().setLowArt(true);
  });
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: the Hall still downloads a portrait per hero although art is off.
  it.each(["rows", "grid"] as const)("draws a %s entry with species, occupation and setting and no picture", async (layout) => {
    useListLayout("hall-of-heroes", "grid").value = layout;
    const wrapper = mount(HallOfHeroesView, { global: { stubs: { RouterLink: true, AiImageBadge: true } } });
    await Promise.resolve();
    await Promise.resolve();
    expect(wrapper.text()).toContain("Drizzt");
    expect(wrapper.text()).toContain("Drow · Ranger");
    expect(wrapper.find("img").exists()).toBe(false);
  });
});
