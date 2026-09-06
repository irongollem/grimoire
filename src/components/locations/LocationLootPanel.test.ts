import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationLootPanel from "./LocationLootPanel.vue";
import { LOCATION_STATE_QUERY_KEY } from "@/composables/locations/useLocationState";
import type { LootPlacement } from "@/types/quest.types";
import type { LootTable } from "@/types/lootTable.types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  dispatch: vi.fn(),
  remove: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ openChatAt: vi.fn() }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "dm" } }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useCreateLootPlacement: () => ({ mutateAsync: mocks.create }),
  useDeleteLootPlacement: () => ({ mutateAsync: mocks.remove }),
  useDispatchLoot: () => ({ mutateAsync: mocks.dispatch }),
}));
vi.mock("@/composables/items/useItems", () => ({ useItems: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/useImageUpload", () => ({ useImageUpload: () => ({ upload: vi.fn() }) }));

const lootTable = (overrides: Partial<LootTable> = {}): LootTable => ({
  id: "table-1", user_id: "dm", campaign_id: "campaign-1", name: "Vault cache",
  description: null, cr_tier: "any",
  entries: [{ id: "entry-1", type: "currency", drop_chance: 100, gp: 12 }],
  tags: [], notes: null, monster_ids: [], created_at: "", updated_at: "",
  ...overrides,
});

const lootTablesRef = { value: [lootTable()] };
vi.mock("@/composables/dungeon-features/useLootTables", () => ({ useLootTables: () => ({ data: lootTablesRef }) }));

const loot = (overrides: Partial<LootPlacement> = {}): LootPlacement => ({
  id: "loot-1", beat_id: null, quest_id: null, location_id: "room-1", campaign_id: "campaign-1",
  kind: "currency", item_id: null, quantity: 1, label: "Chest by the door", payload: { gp: 12 },
  source_type: "loot_table", source_id: "table-1", sort_order: 0, dispatch_message_id: null,
  dispatched_at: null, delivery_state: "held", quantity_remaining: 1, claimed_by_names: [],
  handed_out_this_session: false,
  ...overrides,
});

function mountPanel(props: Partial<InstanceType<typeof LocationLootPanel>["$props"]> = {}) {
  return mount(LocationLootPanel, {
    props: { locationId: "room-1", campaignId: "campaign-1", loot: [], ...props },
  });
}

function findButton(wrapper: ReturnType<typeof mountPanel>, label: string) {
  const button = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
  if (!button) throw new Error(`no AppButton labelled "${label}"`);
  return button;
}

describe("LocationLootPanel", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.dispatch.mockReset();
    mocks.remove.mockReset();
    mocks.invalidateQueries.mockReset();
    lootTablesRef.value = [lootTable()];
  });

  it("prepares a currency entry homed on the room, with no beat and no quest", async () => {
    mocks.create.mockResolvedValue({});
    const wrapper = mountPanel();
    await findButton(wrapper, "Currency").trigger("click");
    await wrapper.find('input[type="number"]').exists(); // ensure currency inputs mounted
    const gpInput = wrapper.findAllComponents({ name: "AppInput" }).find((i) => i.props("modelValue") === 0);
    await gpInput?.vm.$emit("update:modelValue", 12);
    await findButton(wrapper, "Prepare").trigger("click");

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      beat_id: null,
      quest_id: null,
      location_id: "room-1",
      campaign_id: "campaign-1",
      kind: "currency",
      source_type: "prepared",
    }));
  });

  it("rolls a loot table into a held chest with claims_total and rolled_atoms", async () => {
    mocks.create.mockResolvedValue({});
    const wrapper = mountPanel();
    await findButton(wrapper, "Chest").trigger("click");

    const combobox = wrapper.findComponent({ name: "EntityCombobox" });
    await combobox.vm.$emit("update:modelValue", "table-1");
    await findButton(wrapper, "Roll").trigger("click");

    expect(wrapper.text()).toContain("12 GP");

    await findButton(wrapper, "Prepare").trigger("click");

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      beat_id: null,
      quest_id: null,
      location_id: "room-1",
      campaign_id: "campaign-1",
      kind: "loot_chest",
      source_type: "loot_table",
      source_id: "table-1",
    }));
    const call = mocks.create.mock.calls[0]?.[0];
    expect(call.payload.claims_total).toBe(1);
    expect(call.payload.rolled_atoms).toHaveLength(1);
    expect(call.payload.loot_table_name).toBe("Vault cache");
  });

  it("disables Prepare for a loot chest until something has been rolled", async () => {
    const wrapper = mountPanel();
    await findButton(wrapper, "Chest").trigger("click");
    expect(findButton(wrapper, "Prepare").props("disabled")).toBe(true);
  });

  it("invalidates the room's location-state cache once loot is dropped", async () => {
    mocks.dispatch.mockResolvedValue([]);
    const wrapper = mountPanel({ loot: [loot()] });
    await findButton(wrapper, "Drop").trigger("click");
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: [LOCATION_STATE_QUERY_KEY] });
  });

  it("does not invalidate location state when the drop fails", async () => {
    mocks.dispatch.mockRejectedValue(new Error("nope"));
    const wrapper = mountPanel({ loot: [loot()] });
    await findButton(wrapper, "Drop").trigger("click");
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });
});
