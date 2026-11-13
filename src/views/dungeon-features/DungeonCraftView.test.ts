import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DungeonCraftView from "./DungeonCraftView.vue";
import { systemOffers, type GameFeature, type GameSystemKey } from "@/systems/registry";
import { useGeneratorUiStore } from "@/stores/ui/generators";

const mocks = vi.hoisted(() => ({ system: "dnd5e-2024", tab: "features" }));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { tab: mocks.tab } }),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({
  useGameSystem: () => ({ offers: (feature: string) => systemOffers(mocks.system as GameSystemKey, feature as GameFeature) }),
}));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useAvailableLibraryDungeonCraftSources: () => ({ data: ref([]), isLoading: ref(false) }),
}));

// Only the header's action buttons matter here: render them, and render every other child as an empty stub.
const ListActionButton = defineComponent({
  props: ["label", "variant"],
  emits: ["click"],
  setup: (props, { emit }) => () => h("button", { onClick: () => emit("click") }, props.label),
});
const PageHeader = defineComponent({
  setup: (_p, { slots }) => () => h("div", [slots.actions?.()]),
});

function mountView(tab: string) {
  mocks.tab = tab;
  return mount(DungeonCraftView, { shallow: true, global: { stubs: { ListActionButton, ListCreateButton: ListActionButton, PageHeader } } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.system = "dnd5e-2024";
});

// #934: dungeon features, traps and loot tables are written by generators the server
// refuses in a Generic campaign (`generate-entity-text` "feature", `generate-trap`, `generate-loot`).
describe("DungeonCraftView generate buttons", () => {
  it.each([
    ["features", "dungeonFeatureGeneratorOpen"],
    ["traps", "trapGeneratorOpen"],
    ["loot-tables", "lootTableGeneratorOpen"],
  ] as const)("the %s tab offers Generate in a 5e campaign and opens its panel", async (tab, flag) => {
    const w = mountView(tab);
    const button = w.findAll("button").find((b) => b.text() === "Generate");
    expect(button).toBeDefined();
    await button!.trigger("click");
    expect(useGeneratorUiStore()[flag]).toBe(true);
  });

  it.each(["features", "traps", "loot-tables"])("the %s tab offers no Generate in a Generic campaign", (tab) => {
    mocks.system = "generic";
    const w = mountView(tab);
    expect(w.findAll("button").some((b) => b.text() === "Generate")).toBe(false);
    expect(w.findAll("button").some((b) => b.text().startsWith("New"))).toBe(true);
  });

  // Roll tables are written by a generator that has no rules in it: Generic keeps it.
  it("keeps the roll-table Generate in a Generic campaign", () => {
    mocks.system = "generic";
    const w = mountView("roll-tables");
    expect(w.findAll("button").some((b) => b.text() === "Generate")).toBe(true);
  });
});
