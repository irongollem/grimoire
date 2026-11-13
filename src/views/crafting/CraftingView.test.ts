import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import CraftingView from "./CraftingView.vue";
import { useLowArt } from "@/composables/useLowArt";
import { useListLayout } from "@/composables/useListLayout";

useVirtualGridViewport({ viewportPx: 1000000, itemPx: 200 });

const recipes = [
  {
    id: "r1", name: "Salve of Mending", discipline: "alchemy", dc: 12, crafting_time: 1,
    crafting_time_unit: "hours", requires_proficiency: true, requires_tools: false, discoverable: false,
    player_visible_to: [], image_url: "https://x/salve.webp", image_focal_point: null,
  },
];

vi.mock("@/composables/crafting/useCrafting", () => ({
  useCraftingRecipes: () => ({ data: ref(recipes), isLoading: ref(false) }),
  useDeleteRecipe: () => ({ mutateAsync: vi.fn() }),
  useUpdateRecipe: () => ({ mutateAsync: vi.fn() }),
  useImportStarterRecipes: () => ({ isPending: ref(false), mutateAsync: vi.fn() }),
  useRevealAllRecipes: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/crafting/useRecipeArt", () => ({
  useRecipeArt: () => ({ artFor: (r: { image_url: string }) => ({ url: r.image_url, focalPoint: null }) }),
}));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: ref([]) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/useScrollRestore", () => ({ useScrollRestore: vi.fn() }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => false }) }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()), useAbove: () => ref(true) }));
vi.mock("@/lib/placeholderFocalPoints", () => ({
  placeholderUrl: () => "/p.webp",
  initPlaceholderFocalPoints: vi.fn().mockResolvedValue(undefined),
  getPlaceholderFocalPoint: vi.fn(),
}));

const stubs = {
  RouterLink: RouterLinkStub,
  AiImageBadge: true,
  ListPageLayout: { template: "<div><slot /></div>" },
  InventionApprovalQueue: true,
  ManualHelpLink: true,
  AudienceRevealControl: true,
};

async function mountView() {
  const w = mount(CraftingView, { global: { stubs } });
  await flushPromises();
  return w;
}

describe("CraftingView low art", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => {
    useLowArt().setLowArt(false);
    useListLayout("recipes", "rows").value = "rows";
  });

  // Bug: the Workshop still downloads recipe art in low art, and the name vanishes with the image footer.
  it("draws the grid card art-free: discipline eyebrow, name, DC, flags, no picture", async () => {
    useLowArt().setLowArt(true);
    useListLayout("recipes", "rows").value = "grid";
    const w = await mountView();
    expect(w.find("img").exists()).toBe(false);
    expect(w.find("[data-art-free]").exists()).toBe(true);
    expect(w.find("h3").text()).toBe("Salve of Mending");
    expect(w.text()).toContain("DC 12");
    expect(w.text()).toContain("PROF");
  });

  // Bug: the ledger rows lose their column heads, or a row's cells slip out of order.
  it("draws rows as a ledger of discipline, DC and tags", async () => {
    useLowArt().setLowArt(true);
    const w = await mountView();
    const head = w.find("[data-ledger-head]").text();
    expect(head).toContain("Discipline");
    expect(head).toContain("DC");
    expect(head).toContain("Tags");
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("12");
  });

  it("keeps the plate card with its picture when low art is off", async () => {
    useListLayout("recipes", "rows").value = "grid";
    const w = await mountView();
    expect(w.find("[data-art-free]").exists()).toBe(false);
    expect(w.find("img").exists()).toBe(true);
  });
});
