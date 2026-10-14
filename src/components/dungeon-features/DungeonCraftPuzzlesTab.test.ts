import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushMicrotasks, useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import DungeonCraftPuzzlesTab from "./DungeonCraftPuzzlesTab.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import { usePuzzlesUiStore } from "@/stores/ui/puzzles";
import type { LibraryPuzzle, PuzzleRoom } from "@/types/puzzle.types";

function puzzle(overrides: Partial<PuzzleRoom> = {}): PuzzleRoom {
  return {
    id: "00000000-0000-4000-8000-0000000000b1",
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

const mocks = vi.hoisted(() => ({
  puzzles: [] as ReturnType<typeof puzzle>[],
  library: [] as LibraryPuzzle[],
}));

// The empty-state copy asks whether the library has books on offer (#1060).
vi.mock("@/composables/library/useEnabledSources", () => ({
  useDungeonCraftBooksOffered: () => ref(false),
}));
vi.mock("@/composables/dungeon-features/usePuzzles", () => ({
  usePuzzles: () => ({ data: ref(mocks.puzzles), isLoading: ref(false) }),
  useLibraryPuzzles: () => ({ data: ref(mocks.library), isLoading: ref(false) }),
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
useVirtualGridViewport();

function libraryPuzzle(overrides: Partial<LibraryPuzzle> = {}): LibraryPuzzle {
  return {
    id: "grimoire_riddle_door",
    name: "Riddle Door",
    puzzle_type: "Logic",
    difficulty: "Easy",
    description: null,
    read_aloud: null,
    solution: null,
    hints: [],
    skill_checks: [],
    success_outcome: null,
    failure_consequence: null,
    tags: [],
    notes: null,
    image_url: null,
    image_focal_point: null,
    source: "grimoire-dungeon-craft",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function mountTab() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(DungeonCraftPuzzlesTab, {
    global: {
      plugins: [pinia],
      stubs: { CopyToCampaignDialog: true, PaywallModal: true, RouterLink: RouterLinkStub },
    },
  });
}

function findExact(wrapper: ReturnType<typeof mountTab>, text: string) {
  return wrapper.findAll("button").find((b) => b.text() === text);
}

describe("DungeonCraftPuzzlesTab — filter state (Filter State Pattern)", () => {
  beforeEach(() => {
    mocks.puzzles = [puzzle()];
    mocks.library = [];
  });

  it("shows no Clear button when no filter is active", () => {
    const wrapper = mountTab();
    expect(findExact(wrapper, "Clear")).toBeUndefined();
  });

  it("shows Clear once a filter is set, and it resets the store's puzzle filters", async () => {
    const wrapper = mountTab();
    const puzzlesUi = usePuzzlesUiStore();
    puzzlesUi.puzzlesFilterType = "riddle";
    await wrapper.vm.$nextTick();

    expect(findExact(wrapper, "Clear")).toBeDefined();
    await findExact(wrapper, "Clear")!.trigger("click");

    expect(puzzlesUi.puzzlesFilterType).toBe("");
    expect(puzzlesUi.puzzlesHasActiveFilters).toBe(false);
  });

  it("filters the grid by the store's type filter", async () => {
    mocks.puzzles = [puzzle({ puzzle_type: "Logic" }), puzzle({ id: "00000000-0000-4000-8000-0000000000b2", name: "Pressure Plates", puzzle_type: "Physical" })];
    const wrapper = mountTab();
    const puzzlesUi = usePuzzlesUiStore();
    puzzlesUi.puzzlesFilterType = "Physical";
    await flushMicrotasks();

    expect(wrapper.text()).not.toContain("Riddle of the Sphinx");
    expect(wrapper.text()).toContain("Pressure Plates");
  });

  it("survives being torn down and remounted — the filter is not a local ref", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const puzzlesUi = usePuzzlesUiStore();
    puzzlesUi.puzzlesSearch = "sphinx";

    const wrapper = mount(DungeonCraftPuzzlesTab, {
      global: { plugins: [pinia], stubs: { CopyToCampaignDialog: true, PaywallModal: true, RouterLink: RouterLinkStub } },
    });
    wrapper.unmount();

    const remounted = mount(DungeonCraftPuzzlesTab, {
      global: { plugins: [pinia], stubs: { CopyToCampaignDialog: true, PaywallModal: true, RouterLink: RouterLinkStub } },
    });
    expect(usePuzzlesUiStore().puzzlesSearch).toBe("sphinx");
    remounted.unmount();
  });
});

describe("DungeonCraftPuzzlesTab — library puzzles (#1060)", () => {
  beforeEach(() => {
    mocks.puzzles = [puzzle()];
    mocks.library = [libraryPuzzle()];
  });

  it("lists library puzzles beside own ones, marked Library", async () => {
    const wrapper = mountTab();
    await flushMicrotasks();
    expect(wrapper.text()).toContain("Riddle Door");
    expect(wrapper.text()).toContain("Riddle of the Sphinx");
    expect(wrapper.text()).toContain("Library");
  });

  it("hides a library puzzle that an own puzzle of the same name shadows", async () => {
    mocks.puzzles = [puzzle({ name: " riddle DOOR " })];
    const wrapper = mountTab();
    await flushMicrotasks();
    expect(wrapper.text().match(/Riddle Door/gi)).toHaveLength(1);
    expect(wrapper.text()).not.toContain("Library");
  });

  it("applies the type filter to library rows too", async () => {
    mocks.library = [libraryPuzzle({ puzzle_type: "Arcane" })];
    const wrapper = mountTab();
    usePuzzlesUiStore().puzzlesFilterType = "Logic";
    await flushMicrotasks();
    expect(wrapper.text()).not.toContain("Riddle Door");
  });

  it("does not offer a library card for bulk selection", async () => {
    mocks.puzzles = [];
    const wrapper = mountTab();
    await findExact(wrapper, "Select")!.trigger("click");
    await flushMicrotasks();
    expect(wrapper.findComponent(BulkSelectableCard).props("selecting")).toBe(false);
  });
});

describe("DungeonCraftPuzzlesTab — checkbox chip placement", () => {
  beforeEach(() => {
    mocks.puzzles = [puzzle()];
    mocks.library = [];
  });

  it("puts the checkbox chip in the top-right corner, clear of the type badge at top-left", async () => {
    const wrapper = mountTab();
    await flushMicrotasks();
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("top-right");
  });
});
