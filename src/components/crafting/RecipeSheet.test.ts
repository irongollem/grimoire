import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecipeSheet from "./RecipeSheet.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import PortraitOnRequest from "@/components/common/media/PortraitOnRequest.vue";
import { useLowArt } from "@/composables/useLowArt";

vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/crafting/useCrafting", () => ({
  useDeleteRecipe: () => ({ mutateAsync: vi.fn() }),
  useUpdateRecipe: () => ({ mutate: vi.fn() }),
  useRecipeOutputs: () => ({ data: ref([]) }),
  useRecipeIngredients: () => ({ data: ref([]) }),
  useRecipeModifiers: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/items/useStoredItemRefs", () => ({ useStoredItemRefs: () => ({ find: () => undefined }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/components/common/reveal/AudienceRevealControl.vue", () => ({ default: { template: "<span />" } }));

const recipe = {
  id: "r1", name: "Salve of Mending", description: "", discipline: "alchemy", dc: 12,
  crafting_time: 1, crafting_time_unit: "hours", requires_proficiency: false, requires_tools: false,
  discoverable: false, player_visible_to: [], image_url: "https://x/salve.webp", image_focal_point: null,
} as never;

async function mountSheet() {
  const w = mount(RecipeSheet, { props: { recipe }, global: { stubs: { AiImageBadge: true } } });
  await flushPromises();
  return w;
}

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("RecipeSheet low art", () => {
  // Bug: the recipe banner still loads its picture in low art.
  it("drops the banner and keeps the picture behind a Portrait button", async () => {
    useLowArt().setLowArt(true);
    const w = await mountSheet();
    expect(w.findComponent(FocalImage).exists()).toBe(false);
    expect(w.find("img").exists()).toBe(false);
    expect(w.findComponent(PortraitOnRequest).exists()).toBe(true);
    expect(w.text()).toContain("CRAFTING DC");
  });

  it("shows the banner as a record picture with low art off", async () => {
    const w = await mountSheet();
    expect(w.findComponent(FocalImage).props("record")).toBe(true);
    expect(w.findComponent(PortraitOnRequest).exists()).toBe(false);
  });
});
