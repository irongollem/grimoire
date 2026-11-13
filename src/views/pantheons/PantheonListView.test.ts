import { mount } from "@vue/test-utils";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PantheonListView from "./PantheonListView.vue";
import { useLowArt } from "@/composables/useLowArt";
import { useListLayout } from "@/composables/useListLayout";

const pantheons = ref([
  { id: "p1", name: "Faerunian", emblem_url: "https://cdn.test/e.webp", tags: [], player_visible_to: [] },
]);
vi.mock("@/composables/deities/useDeities", () => ({
  useAllPantheons: () => ({ data: pantheons, isLoading: ref(false) }),
  useAllDeities: () => ({ data: ref([{ id: "d1", pantheon_id: "p1" }]) }),
  useUpdatePantheon: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/stores/ui/deities", () => ({
  useDeitiesUiStore: () => ({ pantheonsSearch: "", pantheonsHasActiveFilters: false, resetPantheonsFilters: vi.fn() }),
}));
vi.mock("@/composables/billing/useCreateGate", () => ({
  useCreateGate: () => ({ showPaywall: ref(false), handleNew: vi.fn() }),
}));
vi.mock("@/composables/useScrollRestore", () => ({ useScrollRestore: () => ({}) }));

useVirtualGridViewport();

describe("PantheonListView in low art (#1179)", () => {
  beforeEach(() => {
    useLowArt().setLowArt(true);
  });
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  // Bug: the pantheon list still downloads each emblem although art is off.
  it.each(["rows", "grid"] as const)("draws a %s entry with its deity count and no emblem", async (layout) => {
    useListLayout("pantheons", "rows").value = layout;
    const wrapper = mount(PantheonListView, { global: { stubs: { RouterLink: true, AiImageBadge: true, PaywallModal: true, AudienceRevealControl: true } } });
    await Promise.resolve();
    await Promise.resolve();
    expect(wrapper.text()).toContain("Faerunian");
    expect(wrapper.text()).toContain("1 deity");
    expect(wrapper.find("img").exists()).toBe(false);
  });
});
