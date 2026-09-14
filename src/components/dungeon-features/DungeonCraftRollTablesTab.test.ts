import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DungeonCraftRollTablesTab from "./DungeonCraftRollTablesTab.vue";
import type { RollTable } from "@/types/rollTable.types";

function table(overrides: Partial<RollTable> = {}): RollTable {
  return {
    id: "t1",
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

const mocks = vi.hoisted(() => ({ tables: [] as ReturnType<typeof table>[] }));

vi.mock("@/composables/dungeon-features/useRollTables", () => ({
  useRollTables: () => ({ data: ref(mocks.tables), isLoading: ref(false) }),
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
function mountTab() {
  return mount(DungeonCraftRollTablesTab, {
    global: { stubs: { RollTableDetailView: RollTableDetailViewStub, CopyToCampaignDialog: true } },
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
  });

  it("opens the inline detail view on a normal click when not selecting", async () => {
    const wrapper = mountTab();
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
