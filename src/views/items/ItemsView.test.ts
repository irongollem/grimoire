import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import ItemsView from "./ItemsView.vue";

/**
 * ItemList is replaced wholesale with a minimal stand-in that exposes a fixed
 * `selectableIds` (the contract ItemsView reads through the template ref) —
 * ItemList.test.ts already covers how that computed is derived from the
 * filtered rows. What this file owns is the wiring one level up: the
 * Select/Done toggle, the bar's select-all/move plumbing, and the toast +
 * clear that follow a move. BulkScopeBar itself is mounted for real (as
 * DungeonCraftEntityGrid.test.ts does for the same mechanism) so its actual
 * buttons drive these tests, not a hand-rolled emit.
 */
const mocks = vi.hoisted(() => ({
  selectableIds: ["item-1", "item-2", "item-3"] as string[],
  moveScope: vi.fn(async () => ({ moved: 3 })),
  isMovingScope: false,
  activeCampaignName: "Icewind Dale" as string | null,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/items/ItemList.vue", () => ({
  default: defineComponent({
    name: "ItemList",
    props: {
      search: String,
      typeFilter: String,
      rarityFilter: String,
      sourceFilter: String,
      showAllScopes: Boolean,
      selecting: Boolean,
      selectedIds: Object,
    },
    emits: ["toggle-select"],
    setup(_props, { expose }) {
      // A getter, not a captured value — re-reads `mocks.selectableIds` on
      // every access, the same way the real ItemList's `computed` re-reads its
      // own filtered list, so a test can simulate the DM editing a filter
      // between "Select all shown" and "Move" (#875).
      expose({
        get selectableIds() { return mocks.selectableIds; },
      });
      return () => null;
    },
  }),
}));

vi.mock("@/composables/campaign/useBulkCampaignScope", () => ({
  useBulkCampaignScope: () => ({ mutateAsync: mocks.moveScope, isPending: ref(mocks.isMovingScope) }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    activeCampaign: mocks.activeCampaignName ? { name: mocks.activeCampaignName } : null,
    activeCampaignId: "campaign-1",
  }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: mocks.toastSuccess,
    error: mocks.toastError,
    fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }),
}));
vi.mock("@/composables/items/useItems", () => ({
  useItemSources: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useAvailableLibraryItemSources: () => ({ data: ref([]), isLoading: ref(false) }),
}));
// The dialog's own picker/plan/confirm behaviour (composables hitting
// supabase) is CopyToCampaignDialog.test.ts's job — this stand-in only lets
// this file assert the props ItemsView hands it and drive its `copied` event.
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

function mountView() {
  return mount(ItemsView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        SourcesPickerPanel: true,
      },
    },
  });
}

function findButton(wrapper: ReturnType<typeof mountView>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

describe("ItemsView — bulk move-to-campaign (#875)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.selectableIds = ["item-1", "item-2", "item-3"];
    mocks.moveScope.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastError.mockClear();
    mocks.isMovingScope = false;
    mocks.activeCampaignName = "Icewind Dale";
  });

  it("the Select button turns on the bulk bar, and Done turns it off", async () => {
    const wrapper = mountView();
    expect(wrapper.text()).not.toContain("selected");

    await findButton(wrapper, "Select")!.trigger("click");
    expect(wrapper.text()).toContain("0 selected");

    await findButton(wrapper, "Done")!.trigger("click");
    expect(wrapper.text()).not.toContain("selected");
  });

  it("select-all reads the ids ItemList exposes (every filtered row, not the painted window)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");

    await findButton(wrapper, "Select all shown")!.trigger("click");
    expect(wrapper.text()).toContain("3 selected");
  });

  it("a move calls the mutation with the items table, the selected ids and the campaign id, then stops selecting", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    await findButton(wrapper, "Move to Icewind Dale")!.trigger("click");

    expect(mocks.moveScope).toHaveBeenCalledWith({
      table: "items",
      ids: ["item-1", "item-2", "item-3"],
      campaignId: "campaign-1",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining("Moved 3 items to Icewind Dale"));
    // Stops selecting after a successful move — the bar is gone.
    expect(wrapper.text()).not.toContain("selected");
  });

  it("moving to \"all campaigns\" (null) reports availability rather than a destination", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    await findButton(wrapper, "Make available in all campaigns")!.trigger("click");

    expect(mocks.moveScope).toHaveBeenCalledWith({ table: "items", ids: ["item-1", "item-2", "item-3"], campaignId: null });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining("now available in all campaigns"));
  });

  it("reports the mutation's failure via the toast idiom and stays in selection mode", async () => {
    mocks.moveScope.mockRejectedValueOnce(new Error("network blip"));
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    await findButton(wrapper, "Move to Icewind Dale")!.trigger("click");

    expect(mocks.toastError).toHaveBeenCalledWith("network blip");
    expect(wrapper.text()).toContain("selected");
  });

  it("prunes a stale id at move time when the filter narrows between select-all and move (#875)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");
    expect(wrapper.text()).toContain("3 selected");

    // The DM edits the type/rarity/source filter (or a refetch lands): item-2
    // and item-3 no longer pass. The selection itself is unaware until pruned.
    mocks.selectableIds = ["item-1"];

    await findButton(wrapper, "Move to Icewind Dale")!.trigger("click");

    expect(mocks.moveScope).toHaveBeenCalledWith({
      table: "items",
      ids: ["item-1"],
      campaignId: "campaign-1",
    });
  });

  it("clear empties the selection but the bar stays open", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");
    expect(wrapper.text()).toContain("3 selected");

    await findButton(wrapper, "Clear")!.trigger("click");
    expect(wrapper.text()).toContain("0 selected");
  });
});

describe("ItemsView — bulk copy-to-campaign (#598)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.selectableIds = ["item-1", "item-2", "item-3"];
    mocks.toastSuccess.mockClear();
    mocks.activeCampaignName = "Icewind Dale";
  });

  it("opens the dialog with the pruned selection and the active campaign as the source scope", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("table")).toBe("items");
    expect(dialog.props("ids")).toEqual(["item-1", "item-2", "item-3"]);
    // The source is the active campaign, not any row's own scope — the one
    // destination never offered is the campaign the DM is already standing in.
    expect(dialog.props("sourceCampaignId")).toBe("campaign-1");
    expect(dialog.props("label")).toBe("item");
  });

  it("prunes a stale id at copy time exactly like move (#875)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    mocks.selectableIds = ["item-1"];
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("ids")).toEqual(["item-1"]);
  });

  it("a copied event toasts the count and destination, closes the dialog, and clears the selection", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 3, targetName: "Neverwinter" });

    expect(mocks.toastSuccess).toHaveBeenCalledWith("Copied 3 items to Neverwinter.");
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    // stopSelecting() follows a successful copy, same as a successful move.
    expect(wrapper.text()).not.toContain("selected");
  });
});
