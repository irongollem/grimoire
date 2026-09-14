import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DungeonCraftPuzzlesTab from "./DungeonCraftPuzzlesTab.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import { useUiStore } from "@/stores/ui";
import type { PuzzleRoom } from "@/types/puzzle.types";

function puzzle(overrides: Partial<PuzzleRoom> = {}): PuzzleRoom {
  return {
    id: "p1",
    user_id: "",
    campaign_id: null,
    name: "Riddle of the Sphinx",
    puzzle_type: "Logic",
    difficulty: "Medium",
    description: null,
    hints: [],
    skill_checks: [],
    solution: null,
    image_url: null,
    image_focal_point: null,
    dungeon_feature_id: null,
    location_id: null,
    tags: [],
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as PuzzleRoom;
}

const mocks = vi.hoisted(() => ({ puzzles: [] as ReturnType<typeof puzzle>[] }));

vi.mock("@/composables/dungeon-features/usePuzzles", () => ({
  usePuzzles: () => ({ data: ref(mocks.puzzles), isLoading: ref(false) }),
}));
vi.mock("@/composables/dungeon-features/usePlacedInRooms", () => ({
  usePlacedInRooms: () => ({ placedInRows: () => [], locationsById: ref(new Map()) }),
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
  return mount(DungeonCraftPuzzlesTab, {
    global: {
      plugins: [pinia],
      stubs: { CopyToCampaignDialog: true, PaywallModal: true, RouterLink: true },
    },
  });
}

function findExact(wrapper: ReturnType<typeof mountTab>, text: string) {
  return wrapper.findAll("button").find((b) => b.text() === text);
}

describe("DungeonCraftPuzzlesTab — filter state (Filter State Pattern)", () => {
  beforeEach(() => {
    mocks.puzzles = [puzzle()];
  });

  it("shows no Clear button when no filter is active", () => {
    const wrapper = mountTab();
    expect(findExact(wrapper, "Clear")).toBeUndefined();
  });

  it("shows Clear once a filter is set, and it resets the store's puzzle filters", async () => {
    const wrapper = mountTab();
    const ui = useUiStore();
    ui.puzzlesFilterType = "riddle";
    await wrapper.vm.$nextTick();

    expect(findExact(wrapper, "Clear")).toBeDefined();
    await findExact(wrapper, "Clear")!.trigger("click");

    expect(ui.puzzlesFilterType).toBe("");
    expect(ui.puzzlesHasActiveFilters).toBe(false);
  });

  it("filters the grid by the store's type filter", async () => {
    mocks.puzzles = [puzzle({ id: "p1", puzzle_type: "Logic" }), puzzle({ id: "p2", puzzle_type: "Physical" })];
    const wrapper = mountTab();
    const ui = useUiStore();
    ui.puzzlesFilterType = "Physical";
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain("Riddle of the Sphinx");
  });

  it("survives being torn down and remounted — the filter is not a local ref", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ui = useUiStore();
    ui.puzzlesSearch = "sphinx";

    const wrapper = mount(DungeonCraftPuzzlesTab, {
      global: { plugins: [pinia], stubs: { CopyToCampaignDialog: true, PaywallModal: true, RouterLink: true } },
    });
    wrapper.unmount();

    const remounted = mount(DungeonCraftPuzzlesTab, {
      global: { plugins: [pinia], stubs: { CopyToCampaignDialog: true, PaywallModal: true, RouterLink: true } },
    });
    expect(useUiStore().puzzlesSearch).toBe("sphinx");
    remounted.unmount();
  });
});

describe("DungeonCraftPuzzlesTab — checkbox chip placement", () => {
  beforeEach(() => {
    mocks.puzzles = [puzzle()];
  });

  it("puts the checkbox chip in the top-right corner, clear of the type badge at top-left", () => {
    const wrapper = mountTab();
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("top-right");
  });
});
