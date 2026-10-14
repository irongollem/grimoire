import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushMicrotasks, useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import DungeonCraftTrapsTab from "./DungeonCraftTrapsTab.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import { useTrapsUiStore } from "@/stores/ui/traps";
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

const mocks = vi.hoisted(() => ({ traps: [] as ReturnType<typeof trap>[], offered: false }));

// The empty-state copy asks whether the library has books on offer (#1060).
vi.mock("@/composables/library/useEnabledSources", () => ({
  useDungeonCraftBooksOffered: () => ref(mocks.offered),
}));
vi.mock("@/composables/dungeon-features/useTraps", () => ({
  useTrapIndex: () => ({ data: ref(mocks.traps), isLoading: ref(false) }),
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
useVirtualGridViewport();

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
    const trapsUi = useTrapsUiStore();
    trapsUi.trapsFilterType = "mechanical";
    await wrapper.vm.$nextTick();

    expect(findExact(wrapper, "Clear")).toBeDefined();
    await findExact(wrapper, "Clear")!.trigger("click");

    expect(trapsUi.trapsFilterType).toBe("");
    expect(trapsUi.trapsHasActiveFilters).toBe(false);
  });

  it("filters the grid by the store's type filter", async () => {
    mocks.traps = [trap({ id: "t1", trap_type: "Mechanical" }), trap({ id: "t2", trap_type: "Magical" })];
    const wrapper = mountTab();
    const trapsUi = useTrapsUiStore();
    trapsUi.trapsFilterType = "Magical";
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain("Poison Dart Wall");
  });

  it("survives being torn down and remounted — the filter is not a local ref", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const trapsUi = useTrapsUiStore();
    trapsUi.trapsSearch = "dart";

    const wrapper = mount(DungeonCraftTrapsTab, {
      global: { plugins: [pinia], stubs: { CopyToCampaignDialog: true, RouterLink: true } },
    });
    wrapper.unmount();

    const remounted = mount(DungeonCraftTrapsTab, {
      global: { plugins: [pinia], stubs: { CopyToCampaignDialog: true, RouterLink: true } },
    });
    expect(useTrapsUiStore().trapsSearch).toBe("dart");
    remounted.unmount();
  });
});

describe("DungeonCraftTrapsTab — checkbox chip placement", () => {
  beforeEach(() => {
    mocks.traps = [trap()];
  });

  it("puts the checkbox chip in the top-right corner, clear of the type badge at top-left", async () => {
    const wrapper = mountTab();
    await flushMicrotasks();
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("top-right");
  });
});

describe("DungeonCraftTrapsTab — library traps (#1060)", () => {
  beforeEach(() => {
    mocks.traps = [
      trap({ id: "6f1c1c0e-5b7a-4a3e-9d3a-0c2f6a1b9e11" }),
      { ...trap({ id: "grimoire_hidden_pit", name: "Hidden Pit" }), source: "grimoire-dungeon-craft" } as Trap,
    ];
  });

  it("marks library rows Library, once, and links them by slug", async () => {
    const wrapper = mount(DungeonCraftTrapsTab, {
      global: { plugins: [createPinia()], stubs: { CopyToCampaignDialog: true, RouterLink: RouterLinkStub } },
    });
    await flushMicrotasks();
    expect(wrapper.text()).toContain("Hidden Pit");
    expect(wrapper.text().match(/Library/g)).toHaveLength(1);
    expect(wrapper.findAllComponents(RouterLinkStub).map((l) => l.props("to"))).toContain("/traps/grimoire_hidden_pit");
  });

  it("never lets a library row be selected for bulk actions", async () => {
    const wrapper = mount(DungeonCraftTrapsTab, {
      global: { plugins: [createPinia()], stubs: { CopyToCampaignDialog: true, RouterLink: RouterLinkStub } },
    });
    await flushMicrotasks();
    await findExact(wrapper, "Select")?.trigger("click");
    await flushMicrotasks();
    const cards = wrapper.findAllComponents(BulkSelectableCard);
    expect(cards.map((c) => c.props("selecting")).sort()).toEqual([false, true]);
  });
});

describe("DungeonCraftTrapsTab — empty list (#1060)", () => {
  beforeEach(() => {
    mocks.traps = [];
  });

  it("points at the book icon when Grimoire's books are on offer and none is enabled", () => {
    mocks.offered = true;
    expect(mountTab().text()).toContain("from the book icon above");
    mocks.offered = false;
  });

  it("keeps the plain empty copy when there is no book to enable", () => {
    mocks.offered = false;
    const text = mountTab().text();
    expect(text).not.toContain("book icon");
    expect(text).toContain("Build your first trap");
  });
});
