import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { reactive, ref } from "vue";
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
vi.mock("@/composables/player/useReadItems", () => ({
  useMarkRead: () => ({ mutate: vi.fn() }),
}));
vi.mock("@tanstack/vue-query", () => ({
  useQuery: () => ({ data: { value: [] } }),
}));
// The stores below are plain reactive stubs, not Pinia stores, so storeToRefs has to be handed refs.
vi.mock("pinia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("pinia")>()),
  storeToRefs: (store: Record<string, unknown>) => ({
    activeCampaignId: ref(store.activeCampaignId),
    activeCampaign: ref(store.activeCampaign),
  }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => reactive({ isDM: false, linkedPartyMemberId: "pm-1" }),
}));
vi.mock("@/stores/ui/app", () => ({
  useAppUiStore: () => reactive({ dmPreviewMode: false, dmPreviewPartyMemberId: null }),
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

function mountPanel(inv: PartyInventoryItem, extra: Record<string, unknown> = {}) {
  return mount(ItemDetailPanel, {
    props: { inv, vaultItem: null, attunedCount: 0, equipOptions: [], ...extra },
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

// The modal teleports to <body>, so wrapper.text() is empty: read the page, and unmount each test.
const mounted: VueWrapper[] = [];
afterEach(() => { mounted.splice(0).forEach((w) => w.unmount()); });
const pageText = () => document.body.textContent ?? "";

function mountWith(inv: PartyInventoryItem, vaultItem: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  const wrapper = mount(ItemDetailPanel, {
    props: { inv, vaultItem: vaultItem as never, attunedCount: 0, equipOptions: [], ...extra },
    global: { stubs: { RichTextEditor: true, RichTextViewer: true, ItemDocumentSection: true } },
  });
  mounted.push(wrapper);
  return wrapper;
}
const labels = (w: VueWrapper) => w.findAllComponents({ name: "AppButton" }).map((b) => b.props("label"));

describe("ItemDetailPanel actions row", () => {
  const sword = { id: "v1", item_type: "weapon", rarity: "mundane", tags: [], name: "Sword" };

  it("shows Unequip, not Equip, for a worn item", () => {
    const w = mountWith(makeInv({ location: "equipped", slot: "body" }), sword);
    expect(labels(w)).toContain("Unequip");
    expect(labels(w)).not.toContain("Equip");
  });

  it("equips straight into the only free slot", async () => {
    const w = mountWith(makeInv({ carried_by: "pm-1", location: "backpack" }), sword, {
      equipOptions: [{ slot: "ring", label: "Ring", free: true }],
    });
    await findButton(w, "Equip").trigger("click");
    expect(w.emitted("equip")).toEqual([["ring"]]);
  });

  it("asks which slot when there is a real choice", async () => {
    const w = mountWith(makeInv({ carried_by: "pm-1", location: "backpack" }), sword, {
      equipOptions: [
        { slot: "main_hand", label: "Main hand", free: true },
        { slot: "off_hand", label: "Off hand", free: true },
      ],
    });
    await findButton(w, "Equip").trigger("click");
    expect(w.emitted("equip")).toBeUndefined();
    await findButton(w, "Off hand").trigger("click");
    expect(w.emitted("equip")).toEqual([["off_hand"]]);
  });

  it("disables Equip and says why when every slot is taken", () => {
    const w = mountWith(makeInv({ location: "backpack" }), sword, {
      equipOptions: [{ slot: "body", label: "Body", free: false }],
    });
    expect(findButton(w, "Equip").props("disabled")).toBe(true);
    expect(pageText()).toContain("Your body is taken");
  });

  it("uses the last of a stack on Consume by emitting, and decrements otherwise", async () => {
    const potion = { id: "v2", item_type: "potion", rarity: "common", tags: [], name: "Healing" };
    const one = mountWith(makeInv({ id: "inv-9", quantity: 1 }), potion);
    await findButton(one, "Consume").trigger("click");
    expect(one.emitted("consume")).toEqual([["inv-9"]]);

    const many = mountWith(makeInv({ id: "inv-9", quantity: 3 }), potion);
    await findButton(many, "Consume").trigger("click");
    await flushPromises();
    expect(mocks.updateItem).toHaveBeenCalledWith({ id: "inv-9", update: { quantity: 2 } });
  });

  it("blocks a fourth attunement with a plain message", () => {
    const ring = { id: "v3", item_type: "ring", rarity: "rare", tags: [], name: "Ring", requires_attunement: true };
    const w = mountWith(makeInv({ is_attuned: false }), ring, { attunedCount: 3 });
    expect(findButton(w, "Attune").props("disabled")).toBe(true);
    expect(pageText()).toContain("attuned to 3 items");
  });

  it("offers no attunement while unidentified", () => {
    const ring = { id: "v3", item_type: "ring", rarity: "rare", tags: [], name: "Ring", requires_attunement: true };
    const w = mountWith(makeInv({ is_identified: false }), ring);
    expect(labels(w)).not.toContain("Attune");
    expect(pageText()).toContain("Art object");
    expect(pageText()).not.toContain("Rare");
  });

  it("emits dropToChat", async () => {
    const w = mountWith(makeInv(), sword);
    await findButton(w, "Drop to chat").trigger("click");
    expect(w.emitted("dropToChat")).toHaveLength(1);
  });
});
