import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import HeroDetailView from "./HeroDetailView.vue";
import { useLowArt } from "@/composables/useLowArt";

const hero = ref<Record<string, unknown>>({});
vi.mock("vue-router", async (orig) => ({
  ...(await orig<typeof import("vue-router")>()),
  useRoute: () => ({ params: { id: "h1" } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/party/useHallOfHeroes", () => ({
  useHallOfHero: () => ({ data: hero, isLoading: ref(false) }),
  useImportHero: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isAppAdmin: false, isDM: false }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

const heroRecord = (o: Record<string, unknown> = {}) => ({
  id: "h1", name: "Drizzt", race: "Drow", occupation: "Ranger", alignment: null, age: null,
  status: "alive", setting: "faerun", tags: [], portrait_url: "https://cdn.test/d.webp", portrait_focal_point: null,
  appearance: null, personality: null, backstory: null, ...o,
});
const mountView = () => mount(HeroDetailView, { global: { stubs: { RouterLink: true, AiImageBadge: true, PageHeader: { template: "<div><slot /></div>" }, DmNoteBox: true } } });

describe("HeroDetailView", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("draws the portrait with low art off", () => {
    hero.value = heroRecord();
    expect(mountView().find("img").exists()).toBe(true);
  });

  // Bug: the hero's portrait is fetched in low art.
  it("in low art draws no picture, keeps the identity in a fact line and offers the Portrait button", () => {
    useLowArt().setLowArt(true);
    hero.value = heroRecord();
    const wrapper = mountView();
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Drow");
    expect(wrapper.text()).toContain("Portrait");
  });

  it("in low art offers no Portrait button for a hero without a portrait", () => {
    useLowArt().setLowArt(true);
    hero.value = heroRecord({ portrait_url: null });
    expect(mountView().text()).not.toContain("Portrait");
  });
});
