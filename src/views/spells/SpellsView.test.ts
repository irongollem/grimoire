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
