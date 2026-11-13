import { mount } from "@vue/test-utils";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { computed, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeityListView from "./DeityListView.vue";
import { useLowArt } from "@/composables/useLowArt";
import { useListLayout } from "@/composables/useListLayout";
import type { Deity, Pantheon } from "@/types/deity.types";

function deity(overrides: Partial<Deity> = {}): Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null } {
  return {
    id: "d1",
    user_id: "u1",
    campaign_id: "camp-1",
    name: "Tyr",
    titles: "The Maimed God",
    alternate_names: [],
    pantheon_id: "p1",
    alignment: "Lawful Good",
    symbol: null,
    symbol_image_url: null,
    portrait_url: "https://cdn.test/tyr.webp",
    portrait_focal_point: null,
    domains: ["War", "Order"],
    portfolio: null,
    description: null,
    tags: [],
    player_visible_to: [],
    created_at: "",
    updated_at: "",
    pantheon: { id: "p1", name: "Faerunian" },
    ...overrides,
  };
}

const deitiesData = ref<ReturnType<typeof deity>[]>([]);
vi.mock("@/composables/deities/useDeities", () => ({
  useAllDeities: () => ({ data: deitiesData, isLoading: ref(false) }),
  useAllPantheons: () => ({ data: ref([]) }),
  useUpdateDeity: () => ({ mutate: vi.fn() }),
  usePopulateDeities: () => ({ isPending: ref(false), mutateAsync: vi.fn() }),
  useRevealAllDeities: () => ({ isPending: ref(false), mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/campaign/useSettingContent", () => ({ useSettingContent: () => ({ data: ref(null) }) }));
vi.mock("@/stores/ui/deities", () => ({
  useDeitiesUiStore: () => ({
    deitiesSearch: "",
    deitiesFilterDomain: "",
    deitiesFilterPantheon: "",
    deitiesHasActiveFilters: false,
    resetDeitiesFilters: vi.fn(),
  }),
}));
vi.mock("@/stores/ui/generators", () => ({ useGeneratorUiStore: () => ({ deityGeneratorOpen: false }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => reactive({ activeCampaign: ref({ id: "camp-1" }), isAiEnabled: computed(() => false) }),
}));
vi.mock("@/composables/billing/useCreateGate", () => ({
  useCreateGate: () => ({ showPaywall: ref(false), handleNew: vi.fn(), gateQuotaError: () => false }),
}));
vi.mock("@/composables/useScrollRestore", () => ({ useScrollRestore: () => ({}) }));

useVirtualGridViewport();

const stubs = { RouterLink: true, PaywallModal: true, AudienceRevealControl: true };

describe("DeityListView in low art (#1179)", () => {
  beforeEach(() => {
    useLowArt().setLowArt(true);
    deitiesData.value = [deity()];
  });
  afterEach(() => {
    useLowArt().setLowArt(false);
    deitiesData.value = [];
  });

  // Bug: the deity list still downloads a portrait per god although the DM turned art off.
  it("lists a deity as a ledger row with its alignment tab and no picture", async () => {
    useListLayout("deities", "grid").value = "rows";
    const wrapper = mount(DeityListView, { global: { stubs } });
    await flushMicrotasks();
    expect(wrapper.text()).toContain("Tyr");
    expect(wrapper.text()).toContain("Pantheon");
    expect(wrapper.find('[aria-label="Alignment LG"]').exists()).toBe(true);
    expect(wrapper.find("img").exists()).toBe(false);
  });

  it("draws the grid card with the alignment as its tab and the domains in the foot, no picture", async () => {
    useListLayout("deities", "grid").value = "grid";
    const wrapper = mount(DeityListView, { global: { stubs } });
    await flushMicrotasks();
    expect(wrapper.text()).toContain("The Maimed God");
    expect(wrapper.text()).toContain("War · Order");
    expect(wrapper.find('[aria-label="Alignment LG"]').exists()).toBe(true);
    expect(wrapper.find("img").exists()).toBe(false);
  });

  // Bug: an Unaligned god gets a blank or wrong tab.
  it("hangs no tab from a god with no abbreviable alignment", async () => {
    deitiesData.value = [deity({ alignment: "Unaligned" })];
    useListLayout("deities", "grid").value = "grid";
    const wrapper = mount(DeityListView, { global: { stubs } });
    await flushMicrotasks();
    expect(wrapper.find('[aria-label^="Alignment"]').exists()).toBe(false);
  });
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
