import { mount } from "@vue/test-utils";
import { h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";
import { flushMicrotasks, useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { useListLayout } from "@/composables/useListLayout";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";

// The real CopyToCampaignDialog's setup unconditionally calls useDmCampaigns()
// (a TanStack Query composable) even while closed, and PaywallModal's setup
// does the same via useQuota/usePlan — neither has a query client in this
// suite. Both are stubbed as inspectable components so the tests below can
// assert on the props DungeonCraftEntityGrid passes them and drive their
// emits, without standing up real query infrastructure — CopyToCampaignDialog
// itself is covered by its own test file.
const CopyToCampaignDialogStub = {
  props: ["open", "table", "ids", "label"],
  emits: ["close", "copied", "quota-exceeded"],
  template: `<div data-testid="copy-dialog" />`,
};
const PaywallModalStub = {
  props: ["modelValue", "resource"],
  emits: ["update:modelValue"],
  template: `<div data-testid="paywall-modal" />`,
};

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({ moved: 1 })),
  activeCampaign: { name: "Curse of Strahd" } as { name: string } | null,
  activeCampaignId: "camp-1" as string | null,
  toastSuccess: vi.fn(),
}));

vi.mock("@/composables/campaign/useBulkCampaignScope", () => ({
  useBulkCampaignScope: () => ({ mutateAsync: mocks.mutateAsync, isPending: ref(false) }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaign() { return mocks.activeCampaign; },
    get activeCampaignId() { return mocks.activeCampaignId; },
  }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

useVirtualGridViewport();

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ id: "a" }, { id: "b" }],
    isLoading: false,
    search: "",
    shown: [{ id: "a" }, { id: "b" }],
    itemKey: (item: unknown) => (item as { id: string }).id,
    listKey: "test-grid",
    emptyIcon: "Dices",
    emptyTitle: "No rows yet",
    emptyDescription: "Add one to get started.",
    emptyActionLabel: "New Row",
    ...overrides,
  };
}

/** A minimal card slot: one BulkSelectableCard wrapping a clickable "card". */
function cardSlot(onCardClick: () => void) {
  return (scope: { selecting: boolean; isSelected: (id: string) => boolean; toggle: (id: string) => void }) =>
    h(
      BulkSelectableCard,
      { selected: scope.isSelected("a"), selecting: scope.selecting, onToggle: () => scope.toggle("a") },
      { default: () => h("a", { href: "#", class: "card-a", onClick: onCardClick }, "Card A") },
    );
}

function mountGrid(props: ReturnType<typeof baseProps>, onCardClick: () => void = vi.fn()) {
  return mount(DungeonCraftEntityGrid, {
    props,
    slots: { card: cardSlot(onCardClick) },
    global: { stubs: { CopyToCampaignDialog: CopyToCampaignDialogStub, PaywallModal: PaywallModalStub } },
  });
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll("button").find((b) => b.text() === text || b.text().includes(text));
}

describe("DungeonCraftEntityGrid — bulk scope (#875)", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockClear();
    mocks.activeCampaign = { name: "Curse of Strahd" };
    mocks.activeCampaignId = "camp-1";
  });

  it("without a `table` prop, behaves exactly as before: no Select button, cards render bare", async () => {
    const onCardClick = vi.fn();
    const wrapper = mount(DungeonCraftEntityGrid, { props: baseProps(), slots: { card: cardSlot(onCardClick) } });
    await flushMicrotasks();

    expect(findButton(wrapper, "Select")).toBeUndefined();
    expect(wrapper.find("input[type=checkbox]").exists()).toBe(false);

    // The card's own click still fires — BulkSelectableCard adds no wrapper
    // behaviour at all when `selecting` is false.
    wrapper.get(".card-a").trigger("click");
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it("a card toggles selection instead of firing its own click while selecting", async () => {
    const onCardClick = vi.fn();
    const wrapper = mount(DungeonCraftEntityGrid, {
      props: baseProps({ table: "roll_tables", ids: ["a", "b"] }),
      slots: { card: cardSlot(onCardClick) },
    });

    await findButton(wrapper, "Select")!.trigger("click");
    await wrapper.get(".card-a").trigger("click");

    expect(onCardClick).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("1 selected");
  });

  it("prunes a stale id when the filtered set shrinks, so a move can never reach a now-hidden row (#875)", async () => {
    const wrapper = mount(DungeonCraftEntityGrid, {
      props: baseProps({ table: "roll_tables", ids: ["a", "b"] }),
      slots: { card: cardSlot(vi.fn()) },
    });

    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click"); // selects "a" and "b"
    expect(wrapper.text()).toContain("2 selected");

    // The DM edits the filter (or the query refetches): "b" no longer passes.
    await wrapper.setProps({ ids: ["a"] });
    expect(wrapper.text()).toContain("1 selected");

    await findButton(wrapper, "Make available in all campaigns")!.trigger("click");
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ table: "roll_tables", ids: ["a"], campaignId: null });
  });

  it("a move reaches the bulk-scope mutation with the grid's table, the selected ids and the active campaign id", async () => {
    const wrapper = mount(DungeonCraftEntityGrid, {
      props: baseProps({ table: "roll_tables", ids: ["a", "b"] }),
      slots: { card: cardSlot(vi.fn()) },
    });

    await findButton(wrapper, "Select")!.trigger("click");
    await wrapper.get(".card-a").trigger("click");
    await findButton(wrapper, "Move to Curse of Strahd")!.trigger("click");

    expect(mocks.mutateAsync).toHaveBeenCalledWith({ table: "roll_tables", ids: ["a"], campaignId: "camp-1" });
  });
});

describe("DungeonCraftEntityGrid — copy to campaign (#598)", () => {
  beforeEach(() => {
    mocks.toastSuccess.mockClear();
    mocks.activeCampaignId = "camp-1";
  });

  it("without `copyLabel`, no copy dialog mounts even though `table` is set", () => {
    const wrapper = mountGrid(baseProps({ table: "roll_tables", ids: ["a", "b"] }));
    expect(wrapper.find('[data-testid="copy-dialog"]').exists()).toBe(false);
  });

  it("pressing Copy to campaign… opens the dialog with the pruned selection", async () => {
    const wrapper = mountGrid(baseProps({ table: "roll_tables", ids: ["a", "b"], copyLabel: "roll table" }));

    await findButton(wrapper, "Select")!.trigger("click");
    await wrapper.get(".card-a").trigger("click"); // selects "a"
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent(CopyToCampaignDialogStub);
    expect(dialog.props()).toMatchObject({
      open: true,
      table: "roll_tables",
      ids: ["a"],
      label: "roll table",
    });
  });

  it("on copied: closes the dialog and ends selection", async () => {
    const wrapper = mountGrid(baseProps({ table: "roll_tables", ids: ["a", "b"], copyLabel: "roll table" }));

    await findButton(wrapper, "Select")!.trigger("click");
    await wrapper.get(".card-a").trigger("click");
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent(CopyToCampaignDialogStub);
    await dialog.vm.$emit("copied", { copied: 3, linked: 0, targetName: "Icewind Dale" });

    expect(wrapper.findComponent(CopyToCampaignDialogStub).props("open")).toBe(false);
    expect(wrapper.text()).not.toContain("selected");
  });

  it("no paywall is mounted for a table without the quota trigger (roll_tables)", () => {
    const wrapper = mountGrid(baseProps({ table: "roll_tables", ids: ["a", "b"], copyLabel: "roll table" }));
    expect(wrapper.find('[data-testid="paywall-modal"]').exists()).toBe(false);
  });

  it("on quota-exceeded for puzzle_rooms: closes the copy dialog and opens the paywall", async () => {
    const wrapper = mountGrid(baseProps({ table: "puzzle_rooms", ids: ["a", "b"], copyLabel: "puzzle" }));

    await findButton(wrapper, "Select")!.trigger("click");
    await wrapper.get(".card-a").trigger("click");
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent(CopyToCampaignDialogStub);
    await dialog.vm.$emit("quota-exceeded");

    expect(wrapper.findComponent(CopyToCampaignDialogStub).props("open")).toBe(false);
    expect(wrapper.findComponent(PaywallModalStub).props("modelValue")).toBe(true);
  });
});

describe("DungeonCraftEntityGrid — layout", () => {
  it("renders the row slot instead of the card slot when the tab's layout is rows", async () => {
    useListLayout("test-grid-rows", "grid").value = "rows";
    const wrapper = mount(DungeonCraftEntityGrid, {
      props: baseProps({ listKey: "test-grid-rows" }),
      slots: {
        card: () => h("div", { class: "as-card" }),
        row: () => h("div", { class: "as-row" }),
      },
      global: { stubs: { CopyToCampaignDialog: CopyToCampaignDialogStub, PaywallModal: PaywallModalStub } },
    });
    await flushMicrotasks();
    expect(wrapper.find(".as-row").exists()).toBe(true);
    expect(wrapper.find(".as-card").exists()).toBe(false);
  });
});
