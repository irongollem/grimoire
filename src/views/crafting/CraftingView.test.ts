import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CraftingView from "./CraftingView.vue";
import { systemOffers, type GameFeature, type GameSystemKey } from "@/systems/registry";

const mocks = vi.hoisted(() => ({ system: "dnd5e-2024" }));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: true }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true, activeCampaignId: "c1" }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({
  useGameSystem: () => ({ offers: (feature: string) => systemOffers(mocks.system as GameSystemKey, feature as GameFeature) }),
}));
vi.mock("@/composables/crafting/useCrafting", () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: ref(false) });
  return {
    useCraftingRecipes: () => ({ data: ref([]), isLoading: ref(false) }),
    useDeleteRecipe: mutation,
    useUpdateRecipe: mutation,
    useRevealAllRecipes: mutation,
    useImportStarterRecipes: mutation,
  };
});
vi.mock("@/composables/crafting/useRecipeArt", () => ({ useRecipeArt: () => ({ artFor: () => null }) }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: ref([]) }) }));

const ListActionButton = defineComponent({
  props: ["label"],
  setup: (props) => () => h("button", props.label),
});
const ListPageLayout = defineComponent({
  setup: (_p, { slots }) => () => h("div", [slots.actions?.()]),
});

function mountView() {
  return mount(CraftingView, { shallow: true, global: { stubs: { ListActionButton, ListCreateButton: ListActionButton, ListPageLayout } } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.system = "dnd5e-2024";
});

// #934: the starter recipes resolve against 5e SRD items and `recipe` generation
// is a rules generator, so a Generic campaign is offered neither.
describe("CraftingView actions", () => {
  it("offers the starter-recipe import and Generate in a 5e campaign", () => {
    const labels = mountView().findAll("button").map((b) => b.text());
    expect(labels).toContain("Import Starter Recipes");
    expect(labels).toContain("Generate");
  });

  it("offers neither in a Generic campaign, and still offers New Recipe", () => {
    mocks.system = "generic";
    const labels = mountView().findAll("button").map((b) => b.text());
    expect(labels).not.toContain("Import Starter Recipes");
    expect(labels).not.toContain("Generate");
    expect(labels).toContain("New Recipe");
  });
});
