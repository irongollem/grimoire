import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DungeonCraftTrapsTab from "./DungeonCraftTrapsTab.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import { useUiStore } from "@/stores/ui";
import type { Trap } from "@/types/trap.types";

function trap(overrides: Partial<Trap> = {}): Trap {
  return {
    id: "t1",
    user_id: "",
    campaign_id: null,
    name: "Poison Dart Wall",
    trap_type: "Mechanical",
    trigger_type: null,
    cr: null,
    description: null,
    detect_dc: null,
    disarm_dc: null,
    damage_rolls: null,
    save_attribute: null,
    save_dc: null,
    image_url: null,
    image_focal_point: null,
    tags: [],
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as Trap;
}

const mocks = vi.hoisted(() => ({ traps: [] as ReturnType<typeof trap>[] }));

vi.mock("@/composables/dungeon-features/useTraps", () => ({
  useTraps: () => ({ data: ref(mocks.traps), isLoading: ref(false) }),
}));
vi.mock("@/composables/dungeon-features/usePlacedInRooms", () => ({
  usePlacedInRooms: () => ({ placedInRows: () => [] }),
}));
vi.mock("@/composables/campaign/useBulkCampaignScope", () => ({
  useBulkCampaignScope: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaign: null, activeCampaignId: null }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

// CopyToCampaignDialog always mounts here (the tab always passes `copy-label`,
// #598), and its own setup unconditionally calls useDmCampaigns(), which needs
// a real query client this suite doesn't stand up — stubbed away, same as
// DungeonCraftRollTablesTab.test.ts.
function mountTab() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(DungeonCraftTrapsTab, {
    global: {
      plugins: [pinia],
      stubs: { CopyToCampaignDialog: true, RouterLink: true },
    },
  });
}

function findExact(wrapper: ReturnType<typeof mountTab>, text: string) {
  return wrapper.findAll("button").find((b) => b.text() === text);
}

describe("DungeonCraftTrapsTab — filter state (Filter State Pattern)", () => {
  beforeEach(() => {
    mocks.traps = [trap()];
  });

  it("shows no Clear button when no filter is active", () => {
    const wrapper = mountTab();
    expect(findExact(wrapper, "Clear")).toBeUndefined();
  });

  it("shows Clear once a filter is set, and it resets the store's trap filters", async () => {
    const wrapper = mountTab();
    const ui = useUiStore();
    ui.trapsFilterType = "mechanical";
    await wrapper.vm.$nextTick();

    expect(findExact(wrapper, "Clear")).toBeDefined();
    await findExact(wrapper, "Clear")!.trigger("click");

    expect(ui.trapsFilterType).toBe("");
    expect(ui.trapsHasActiveFilters).toBe(false);
  });

  it("filters the grid by the store's type filter", async () => {
    mocks.traps = [trap({ id: "t1", trap_type: "Mechanical" }), trap({ id: "t2", trap_type: "Magical" })];
    const wrapper = mountTab();
    const ui = useUiStore();
    ui.trapsFilterType = "Magical";
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain("Poison Dart Wall");
  });

  it("survives being torn down and remounted — the filter is not a local ref", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ui = useUiStore();
    ui.trapsSearch = "dart";

    const wrapper = mount(DungeonCraftTrapsTab, {
      global: { plugins: [pinia], stubs: { CopyToCampaignDialog: true, RouterLink: true } },
    });
    wrapper.unmount();

    const remounted = mount(DungeonCraftTrapsTab, {
      global: { plugins: [pinia], stubs: { CopyToCampaignDialog: true, RouterLink: true } },
    });
    expect(useUiStore().trapsSearch).toBe("dart");
    remounted.unmount();
  });
});

describe("DungeonCraftTrapsTab — checkbox chip placement", () => {
  beforeEach(() => {
    mocks.traps = [trap()];
  });

  it("puts the checkbox chip in the top-right corner, clear of the type badge at top-left", () => {
    const wrapper = mountTab();
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("top-right");
  });
});
