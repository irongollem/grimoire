import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { reactive, ref, defineComponent, h } from "vue";
import ItemDetailView from "./ItemDetailView.vue";

/**
 * Covers the Copy to campaign wiring (#598, wave 2) only — the rest of this
 * view (edit/clone/delete/save) is exercised through ItemDetail.vue's own
 * tests. CopyToCampaignDialog is replaced with a minimal stand-in that
 * records the props it was given and lets a test fire `copied` on demand;
 * the dialog's own picker/plan/confirm behaviour is CopyToCampaignDialog.test.ts's
 * job, not this view's.
 */
const mocks = vi.hoisted(() => ({
  route: {
    name: "item-detail",
    params: { id: "item-1" },
    query: {} as Record<string, string>,
  },
  replace: vi.fn(),
  item: {
    id: "item-1",
    name: "Longsword of Testing",
    item_type: "weapon",
    rarity: "uncommon",
    campaign_id: "campaign-1",
  } as Record<string, unknown>,
  isShared: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/composables/items/useItems", () => ({
  useResolvedItem: () => ({
    data: ref({ item: mocks.item, isShared: mocks.isShared }),
    isLoading: ref(false),
  }),
  useEnsureOwnedItem: () => ({ ensureOwnedItem: vi.fn() }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: mocks.toastSuccess,
    error: mocks.toastError,
    fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }),
}));

vi.mock("@/components/common/CopyToCampaignDialog.vue", () => ({
  default: defineComponent({
    name: "CopyToCampaignDialog",
    props: ["open", "table", "ids", "sourceCampaignId", "label"],
    emits: ["close", "copied", "quota-exceeded"],
    setup(props) {
      return () => (props.open ? h("div", { class: "copy-dialog-stub" }) : null);
    },
  }),
}));

function findButton(wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

// The edit-mode action row is gated on `isEditing && itemDetail` — the
// second half is a template ref to ItemDetail, which Vue settles on the
// post-render flush queue rather than synchronously within mount(), so every
// caller awaits one tick before reading the header actions.
async function mountView() {
  const wrapper = mount(ItemDetailView, {
    global: {
      stubs: {
        ItemSheet: true,
        ItemDetail: true,
        ItemSendMenu: true,
        LoadingSpinner: true,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("ItemDetailView — copy to campaign (#598)", () => {
  beforeEach(() => {
    mocks.route.name = "item-detail";
    mocks.route.params = { id: "item-1" };
    mocks.route.query = { edit: "true" };
    mocks.item = {
      id: "item-1",
      name: "Longsword of Testing",
      item_type: "weapon",
      rarity: "uncommon",
      campaign_id: "campaign-1",
    };
    mocks.isShared = false;
    mocks.replace.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastError.mockClear();
  });

  it("offers Copy to campaign… for an owned item in edit mode, wired to the item's own scope", async () => {
    const wrapper = await mountView();
    const button = findButton(wrapper, "Copy to campaign…");
    expect(button).toBeTruthy();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(false);
    expect(dialog.props("table")).toBe("items");
    expect(dialog.props("ids")).toEqual(["item-1"]);
    expect(dialog.props("sourceCampaignId")).toBe("campaign-1");
    expect(dialog.props("label")).toBe("item");
  });

  it("clicking the action opens the dialog", async () => {
    const wrapper = await mountView();
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(true);
  });

  it("does not offer Copy to campaign… for a shared/library item", async () => {
    mocks.isShared = true;
    const wrapper = await mountView();
    expect(findButton(wrapper, "Copy to campaign…")).toBeUndefined();
  });

  it("a copied event toasts the item name and destination, closes the dialog, and never navigates", async () => {
    const wrapper = await mountView();
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 1, targetName: "Icewind Dale" });

    expect(mocks.toastSuccess).toHaveBeenCalledWith('Copied "Longsword of Testing" to Icewind Dale.');
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    // The copy lands in another campaign, which this page cannot show — no
    // create-style navigation follows it, unlike "Clone" on this same row.
    expect(mocks.replace).not.toHaveBeenCalledWith(expect.stringContaining("/vault/"));
  });
});
