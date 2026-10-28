import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import ItemsView from "./ItemsView.vue";
import { useItemsUiStore } from "@/stores/ui/items";

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
const mocks = await vi.hoisted(async () => {
  const { reactive } = await import("vue");
  return reactive({
  selectableIds: ["item-1", "item-2", "item-3"] as string[],
  ready: true,
  sources: [] as { slug: string; title: string | null }[],
  moveScope: vi.fn(async () => ({ moved: 3 })),
  isMovingScope: false,
  activeCampaignName: "Icewind Dale" as string | null,
  aiEnabled: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  });
});

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (source: string | null | undefined, title?: string | null) => (source ? (title ?? source) : null),
  }),
}));

vi.mock("@/components/items/ItemList.vue", () => ({
  default: defineComponent({
    name: "ItemList",
    props: {
      search: String,
      typeFilter: String,
      rarityFilter: String,
      sourceFilter: String,
      scopeFilter: String,
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
        get ready() { return mocks.ready; },
        get sources() { return mocks.sources; },
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
    get isAiEnabled() { return mocks.aiEnabled; },
  }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: mocks.toastSuccess,
    error: mocks.toastError,
    fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }),
}));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useAvailableLibraryItemSources: () => ({ data: ref([]), isLoading: ref(false) }),
}));
// The dialog's own picker/plan/confirm behaviour (composables hitting
// supabase) is CopyToCampaignDialog.test.ts's job — this stand-in only lets
// this file assert the props ItemsView hands it and drive its `copied` event.
vi.mock("@/components/common/overlays/CopyToCampaignDialog.vue", () => ({
  default: defineComponent({
    name: "CopyToCampaignDialog",
    props: ["open", "table", "ids", "label"],
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
    mocks.ready = true;
    mocks.sources = [];
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

  it("select-all reads the ids ItemList exposes (every filtered row, not the painted window), and Clear empties them", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");

    await findButton(wrapper, "Select all shown")!.trigger("click");
    expect(wrapper.text()).toContain("3 selected");

    await findButton(wrapper, "Clear")!.trigger("click");
    expect(wrapper.text()).toContain("0 selected");
  });

  // The flow's own behaviour (prune at move time, toast wording, failure,
  // stop) is useMoveToCampaignFlow.test.ts; this is only that the view hands
  // it the items table and ItemList's selectable ids.
  it("a move reaches the items table with the selected ids and the campaign id, then stops selecting", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    await findButton(wrapper, "Move to Icewind Dale")!.trigger("click");

    expect(mocks.moveScope).toHaveBeenCalledWith({
      table: "items",
      ids: ["item-1", "item-2", "item-3"],
      campaignId: "campaign-1",
    });
    expect(wrapper.text()).not.toContain("selected");
  });

  it("drops a selected id the moment ItemList stops exposing it (#875)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");
    expect(wrapper.text()).toContain("3 selected");

    mocks.selectableIds = ["item-1"];
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("1 selected");
  });

  it("keeps the selection while ItemList's first page is still loading, when its stand-in ids are empty (#875)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    mocks.ready = false;
    mocks.selectableIds = [];
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("3 selected");
  });
});

describe("ItemsView — bulk copy-to-campaign (#598)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.selectableIds = ["item-1", "item-2", "item-3"];
    mocks.ready = true;
    mocks.toastSuccess.mockClear();
    mocks.activeCampaignName = "Icewind Dale";
  });

  it("opens the dialog on the items table with the selected ids, and its copied event closes it and ends selection", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("table")).toBe("items");
    expect(dialog.props("ids")).toEqual(["item-1", "item-2", "item-3"]);

    await dialog.vm.$emit("copied", { copied: 3, linked: 0, targetName: "Neverwinter" });

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.text()).not.toContain("selected");
  });
});

describe("ItemsView — AI off", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("hides the Generate button when the campaign's AI is off", () => {
    mocks.aiEnabled = false;
    expect(findButton(mountView(), "Generate")).toBeUndefined();
  });

  it("shows the Generate button when AI is on", () => {
    mocks.aiEnabled = true;
    expect(findButton(mountView(), "Generate")).toBeDefined();
    mocks.aiEnabled = false;
  });
});

describe("ItemsView — server-driven Source filter (#972)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.ready = true;
  });

  it("hides the Source filter until the server reports sources", () => {
    mocks.sources = [];
    expect(mountView().find('[aria-label="Source filter"]').exists()).toBe(false);
  });

  it("lists the sources ItemList exposes, labelled by title", async () => {
    mocks.sources = [{ slug: "srd-2024", title: "SRD 2024" }];
    const wrapper = mountView();
    // ItemList's exposed value reaches the view after its first mount.
    await wrapper.vm.$nextTick();
    const select = wrapper.find('[aria-label="Source filter"]');
    expect(select.exists()).toBe(true);
    expect(select.text()).toContain("SRD 2024");
  });
});

describe("ItemsView — filters live in the store and clear together", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.sources = [];
  });

  it("hands the stored filters to the list, and Clear puts every one back", async () => {
    const ui = useItemsUiStore();
    ui.vaultSearch = "sword";
    ui.vaultFilterType = "weapon";
    ui.vaultFilterRarity = "rare";
    const wrapper = mountView();
    const list = wrapper.findComponent({ name: "ItemList" });
    expect(list.props()).toMatchObject({ search: "sword", typeFilter: "weapon", rarityFilter: "rare" });

    await wrapper.findAll("button").find((b) => b.text() === "Clear filters")!.trigger("click");
    expect(ui.vaultSearch).toBe("");
    expect(ui.vaultFilterType).toBe("");
    expect(ui.vaultFilterRarity).toBe("");
    expect(ui.vaultHasActiveFilters).toBe(false);
  });

  it("offers no Clear while nothing is filtered", () => {
    expect(mountView().findAll("button").some((b) => b.text() === "Clear filters")).toBe(false);
  });
});
