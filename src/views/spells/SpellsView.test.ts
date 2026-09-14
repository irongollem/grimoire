import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, ref } from "vue";
import SpellsView from "./SpellsView.vue";

/**
 * SpellList is replaced wholesale with a minimal stand-in that exposes a
 * fixed `selectableIds` (the contract SpellsView reads through the template
 * ref) — SpellList.test.ts already covers how that computed is derived from
 * the filtered rows. What this file owns is the wiring one level up: the
 * Select/Done toggle, the bar's select-all/move plumbing, and the toast +
 * stop that follow a move. BulkScopeBar itself is mounted for real (as
 * DungeonCraftEntityGrid.test.ts does for the same mechanism) so its actual
 * buttons drive these tests, not a hand-rolled emit.
 */
const mocks = vi.hoisted(() => ({
  selectableIds: ["spell-1", "spell-2", "spell-3"] as string[],
  moveScope: vi.fn(async () => ({ moved: 3 })),
  isMovingScope: false,
  activeCampaignName: "Icewind Dale" as string | null,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/spells/SpellList.vue", () => ({
  default: defineComponent({
    name: "SpellList",
    props: {
      search: String,
      levelFilter: String,
      schoolFilter: String,
      classFilter: String,
      sourceFilter: String,
      selecting: Boolean,
      selectedIds: Object,
    },
    emits: ["toggle-select", "spell-click"],
    setup(_props, { expose }) {
      // A getter, not a captured value — re-reads `mocks.selectableIds` on
      // every access, the same way the real SpellList's `computed` re-reads
      // its own filtered list, so a test can simulate the DM editing a filter
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
vi.mock("@/composables/library/useEnabledSources", () => ({
  useEnabledSources: () => ({ data: ref([]) }),
  useAvailableLibrarySpellSources: () => ({ data: ref([]), isLoading: ref(false) }),
}));

function mountView() {
  return mount(SpellsView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        SourcesPickerPanel: true,
        // CopyToCampaignDialog reads useDmCampaigns (TanStack Query) — its own
        // internals are covered by CopyToCampaignDialog.test.ts; this file
        // owns only the wiring one level up (open/ids/sourceCampaignId and the
        // @copied handler), which the copy-to-campaign describe block below
        // exercises against the stub directly.
        CopyToCampaignDialog: true,
      },
    },
  });
}

function findButton(wrapper: ReturnType<typeof mountView>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

describe("SpellsView — bulk move-to-campaign (#875)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.selectableIds = ["spell-1", "spell-2", "spell-3"];
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

  it("select-all reads the ids SpellList exposes (every filtered row, not the painted window)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");

    await findButton(wrapper, "Select all shown")!.trigger("click");
    expect(wrapper.text()).toContain("3 selected");
  });

  it("a move calls the mutation with the spells table, the selected ids and the campaign id, then stops selecting", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    await findButton(wrapper, "Move to Icewind Dale")!.trigger("click");

    expect(mocks.moveScope).toHaveBeenCalledWith({
      table: "spells",
      ids: ["spell-1", "spell-2", "spell-3"],
      campaignId: "campaign-1",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining("Moved 3 spells to Icewind Dale"));
    expect(wrapper.text()).not.toContain("selected");
  });

  it("moving to \"all campaigns\" (null) reports availability rather than a destination", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    await findButton(wrapper, "Make available in all campaigns")!.trigger("click");

    expect(mocks.moveScope).toHaveBeenCalledWith({ table: "spells", ids: ["spell-1", "spell-2", "spell-3"], campaignId: null });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining("now available in all campaigns"));
  });

  it("prunes a stale id at move time when the filter narrows between select-all and move (#875)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");
    expect(wrapper.text()).toContain("3 selected");

    // The DM edits the level/school/class filter (or a refetch lands):
    // spell-2 and spell-3 no longer pass. The selection is unaware until pruned.
    mocks.selectableIds = ["spell-1"];

    await findButton(wrapper, "Move to Icewind Dale")!.trigger("click");

    expect(mocks.moveScope).toHaveBeenCalledWith({
      table: "spells",
      ids: ["spell-1"],
      campaignId: "campaign-1",
    });
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
});

describe("SpellsView — bulk copy-to-campaign (#598)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.selectableIds = ["spell-1", "spell-2", "spell-3"];
    mocks.toastSuccess.mockClear();
    mocks.activeCampaignName = "Icewind Dale";
  });

  function findDialog(wrapper: ReturnType<typeof mountView>) {
    return wrapper.findComponent({ name: "CopyToCampaignDialog" });
  }

  it("opens the dialog with the pruned selection, scoped to the active campaign (not any row's own scope)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = findDialog(wrapper);
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("ids")).toEqual(["spell-1", "spell-2", "spell-3"]);
    expect(dialog.props("sourceCampaignId")).toBe("campaign-1");
    expect(dialog.props("table")).toBe("spells");
  });

  it("prunes a stale id at copy-open time when the filter narrowed since select-all (#875 discipline applied to copy)", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    mocks.selectableIds = ["spell-1"];

    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    expect(findDialog(wrapper).props("ids")).toEqual(["spell-1"]);
  });

  it("toasts the count and destination, closes the dialog and leaves selection mode on copied", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    await findDialog(wrapper).vm.$emit("copied", { copied: 3, targetName: "Neverwinter" });

    expect(mocks.toastSuccess).toHaveBeenCalledWith("Copied 3 spells to Neverwinter.");
    expect(findDialog(wrapper).props("open")).toBe(false);
    // Selection mode ends, exactly as it does after a move. A copy does leave
    // the originals here and still selectable, so keeping the selection would
    // be defensible — but all five bulk surfaces have to agree on what
    // finishing a bulk action looks like, and every move already ends it.
    expect(wrapper.text()).not.toContain("selected");
    expect(findButton(wrapper, "Select")).toBeTruthy();
  });
});
