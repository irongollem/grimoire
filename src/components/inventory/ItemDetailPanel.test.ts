import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { reactive } from "vue";
import ItemDetailPanel from "./ItemDetailPanel.vue";
import type { PartyInventoryItem } from "@/types/inventory.types";

const mocks = vi.hoisted(() => ({ updateItem: vi.fn() }));

vi.mock("@/composables/items/usePartyInventory", () => ({
  useUpdateInventoryItem: () => ({ mutateAsync: mocks.updateItem }),
}));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendFlavorMessage: vi.fn(), sendRoll: vi.fn() }),
}));
vi.mock("@/composables/dice/usePromptedRoll", () => ({
  usePromptedRoll: () => ({ promptRoll: vi.fn() }),
}));
vi.mock("@/composables/play/useReadItems", () => ({
  useMarkRead: () => ({ mutate: vi.fn() }),
}));
vi.mock("@tanstack/vue-query", () => ({
  useQuery: () => ({ data: { value: [] } }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => reactive({ isDM: false, linkedPartyMemberId: "pm-1" }),
}));
vi.mock("@/stores/ui", () => ({
  useUiStore: () => reactive({ dmPreviewMode: false, dmPreviewPartyMemberId: null }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => reactive({ activeCampaignId: "campaign-1", activeCampaign: { user_id: "dm-1" } }),
}));

function makeInv(overrides: Partial<PartyInventoryItem> = {}): PartyInventoryItem {
  return {
    id: "inv-1",
    campaign_id: "campaign-1",
    user_id: "dm-1",
    item_id: "item-1",
    library_item_id: null,
    name: "Bag of Holding",
    quantity: 1,
    carried_by: null,
    location: "stored",
    slot: null,
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
    current_charges: null,
    updated_at: "",
    is_identified: true,
    is_ruined: false,
    sort_order: 0,
    curse_revealed: false,
    ...overrides,
  };
}

function mountPanel(inv: PartyInventoryItem) {
  return mount(ItemDetailPanel, {
    props: { inv, vaultItem: null, attunedCount: 0 },
    global: { stubs: { RichTextEditor: true, RichTextViewer: true } },
  });
}

function findButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
  if (!button) throw new Error(`no AppButton labelled "${label}" — have: ${wrapper.findAllComponents({ name: "AppButton" }).map((b) => b.props("label")).join(" | ")}`);
  return button;
}

function editor(wrapper: VueWrapper) {
  return wrapper.findComponent({ name: "RichTextEditor" });
}

beforeEach(() => {
  mocks.updateItem.mockReset();
  mocks.updateItem.mockResolvedValue(undefined);
});

describe("ItemDetailPanel — Notes (#809)", () => {
  it("shows an Add a note button when the item has no note yet", () => {
    const wrapper = mountPanel(makeInv({ notes: null }));
    expect(findButton(wrapper, "Add a note").exists()).toBe(true);
    expect(editor(wrapper).exists()).toBe(false);
  });

  it("opens the editor, seeded empty, when Add a note is clicked", async () => {
    const wrapper = mountPanel(makeInv({ notes: null }));
    await findButton(wrapper, "Add a note").trigger("click");

    expect(editor(wrapper).exists()).toBe(true);
    expect(editor(wrapper).props("modelValue")).toBeNull();
  });

  it("saves the typed note against the inventory row id and returns to the viewer", async () => {
    const wrapper = mountPanel(makeInv({ id: "inv-42", notes: null }));
    await findButton(wrapper, "Add a note").trigger("click");

    editor(wrapper).vm.$emit("update:modelValue", "Whispers when unsheathed");
    await findButton(wrapper, "Save").trigger("click");
    await flushPromises();

    expect(mocks.updateItem).toHaveBeenCalledWith({
      id: "inv-42",
      update: { notes: "Whispers when unsheathed" },
    });
    expect(editor(wrapper).exists()).toBe(false);
    expect(findButton(wrapper, "Edit").exists()).toBe(true);
  });

  it("writes null when the editor is saved empty", async () => {
    const wrapper = mountPanel(makeInv({ id: "inv-7", notes: null }));
    await findButton(wrapper, "Add a note").trigger("click");
    await findButton(wrapper, "Save").trigger("click");
    await flushPromises();

    expect(mocks.updateItem).toHaveBeenCalledWith({ id: "inv-7", update: { notes: null } });
  });

  it("discards the draft on Cancel without calling the mutation", async () => {
    const wrapper = mountPanel(makeInv({ notes: "Original note" }));
    await findButton(wrapper, "Edit").trigger("click");

    editor(wrapper).vm.$emit("update:modelValue", "Something else entirely");
    await findButton(wrapper, "Cancel").trigger("click");
    await flushPromises();

    expect(mocks.updateItem).not.toHaveBeenCalled();
    expect(editor(wrapper).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "RichTextViewer" }).props("content")).toBe("Original note");
  });
});
