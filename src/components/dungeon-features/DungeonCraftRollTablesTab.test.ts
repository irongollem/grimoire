import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushMicrotasks, useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import DungeonCraftRollTablesTab from "./DungeonCraftRollTablesTab.vue";
import type { LibraryRollTable, RollTable } from "@/types/rollTable.types";

function table(overrides: Partial<RollTable> = {}): RollTable {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    user_id: "",
    campaign_id: null,
    name: "Forest Encounters",
    description: null,
    dice: "1d20",
    entries: [],
    tags: [],
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({
  tables: [] as ReturnType<typeof table>[],
  library: [] as LibraryRollTable[],
}));

// The empty-state copy asks whether the library has books on offer (#1060).
vi.mock("@/composables/library/useEnabledSources", () => ({
  useDungeonCraftBooksOffered: () => ref(false),
}));
vi.mock("@/composables/dungeon-features/useRollTables", () => ({
  useRollTables: () => ({ data: ref(mocks.tables), isLoading: ref(false) }),
  useLibraryRollTables: () => ({ data: ref(mocks.library), isLoading: ref(false) }),
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

const LibraryRollTableSheetStub = {
  props: ["tableId"],
  emits: ["done", "used"],
  template: `<div data-testid="library-sheet">{{ tableId }}</div>`,
};

const RollTableDetailViewStub = {
  props: ["inlineId", "inlineNew"],
  emits: ["done"],
  template: `<div data-testid="detail-view" />`,
};

// The tab always passes `copy-label="roll table"` to the grid (#598), so the
// grid always mounts CopyToCampaignDialog — even while closed — and its setup
// unconditionally calls useDmCampaigns(), which needs a real query client.
// Stubbed out here because this suite is about the inline-detail-swap
// interaction, not the copy dialog (that gets its own coverage in
// DungeonCraftEntityGrid.test.ts).
useVirtualGridViewport();

function mountTab() {
  return mount(DungeonCraftRollTablesTab, {
    global: { stubs: { RollTableDetailView: RollTableDetailViewStub, LibraryRollTableSheet: LibraryRollTableSheetStub, CopyToCampaignDialog: true } },
  });
}

function findExact(wrapper: ReturnType<typeof mountTab>, text: string) {
  return wrapper.findAll("button").find((b) => b.text() === text);
}

function findCardButton(wrapper: ReturnType<typeof mountTab>, name: string) {
  return wrapper.findAll("button").find((b) => b.text().includes(name));
}

describe("DungeonCraftRollTablesTab — bulk scope suppresses the inline detail swap (#875)", () => {
  beforeEach(() => {
    mocks.tables = [table()];
    mocks.library = [];
  });

  it("opens the inline detail view on a normal click when not selecting", async () => {
    const wrapper = mountTab();
    await flushMicrotasks();
    await findCardButton(wrapper, "Forest Encounters")!.trigger("click");
    expect(wrapper.find('[data-testid="detail-view"]').exists()).toBe(true);
  });

  it("does not open the inline detail view when the card is clicked while selecting", async () => {
    const wrapper = mountTab();

    await findExact(wrapper, "Select")!.trigger("click");
    await findCardButton(wrapper, "Forest Encounters")!.trigger("click");

    expect(wrapper.find('[data-testid="detail-view"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("1 selected");
  });
});

describe("DungeonCraftRollTablesTab — library tables (#1060)", () => {
  const libraryTable = (overrides: Partial<LibraryRollTable> = {}): LibraryRollTable => ({
    id: "grimoire_forest_road",
    name: "Forest Road",
    description: null,
    dice: "1d6",
    entries: [],
    tags: [],
    notes: null,
    source: "grimoire-dungeon-craft",
    created_at: "",
    updated_at: "",
    ...overrides,
  });

  beforeEach(() => {
    mocks.tables = [table()];
    mocks.library = [libraryTable()];
  });

  it("lists library tables marked Library and opens one in the read-only sheet", async () => {
    const wrapper = mountTab();
    await flushMicrotasks();
    expect(wrapper.text()).toContain("Library");
    await findCardButton(wrapper, "Forest Road")!.trigger("click");
    expect(wrapper.find('[data-testid="library-sheet"]').text()).toBe("grimoire_forest_road");
    expect(wrapper.find('[data-testid="detail-view"]').exists()).toBe(false);
  });

  it("selects the own copy once the sheet reports it used", async () => {
    const wrapper = mountTab();
    await flushMicrotasks();
    await findCardButton(wrapper, "Forest Road")!.trigger("click");
    wrapper.findComponent(LibraryRollTableSheetStub).vm.$emit("used", "11111111-1111-4111-8111-111111111111");
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="library-sheet"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="detail-view"]').exists()).toBe(true);
  });

  it("hides a library table shadowed by an own table of the same name", async () => {
    mocks.tables = [table({ name: "forest road" })];
    const wrapper = mountTab();
    await flushMicrotasks();
    expect(wrapper.text()).not.toContain("Library");
  });
});
