import { mount } from "@vue/test-utils";
import { h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({ moved: 1 })),
  activeCampaign: { name: "Curse of Strahd" } as { name: string } | null,
  activeCampaignId: "camp-1" as string | null,
}));

vi.mock("@/composables/campaign/useBulkCampaignScope", () => ({
  useBulkCampaignScope: () => ({ mutateAsync: mocks.mutateAsync, isPending: { value: false } }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaign() { return mocks.activeCampaign; },
    get activeCampaignId() { return mocks.activeCampaignId; },
  }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ id: "a" }, { id: "b" }],
    isLoading: false,
    search: "",
    filteredCount: 2,
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

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll("button").find((b) => b.text() === text || b.text().includes(text));
}

describe("DungeonCraftEntityGrid — bulk scope (#875)", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockClear();
    mocks.activeCampaign = { name: "Curse of Strahd" };
    mocks.activeCampaignId = "camp-1";
  });

  it("without a `table` prop, behaves exactly as before: no Select button, cards render bare", () => {
    const onCardClick = vi.fn();
    const wrapper = mount(DungeonCraftEntityGrid, { props: baseProps(), slots: { card: cardSlot(onCardClick) } });

    expect(findButton(wrapper, "Select")).toBeUndefined();
    expect(wrapper.find("input[type=checkbox]").exists()).toBe(false);

    // The card's own click still fires — BulkSelectableCard adds no wrapper
    // behaviour at all when `selecting` is false.
    wrapper.get(".card-a").trigger("click");
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it("with a `table` prop, the Select button turns on selection mode", async () => {
    const wrapper = mount(DungeonCraftEntityGrid, {
      props: baseProps({ table: "roll_tables", ids: ["a", "b"] }),
      slots: { card: cardSlot(vi.fn()) },
    });

    expect(wrapper.text()).not.toContain("selected");
    await findButton(wrapper, "Select")!.trigger("click");
    expect(wrapper.text()).toContain("0 selected");
  });

  it("select all shown selects every filtered id, not only what's painted", async () => {
    const wrapper = mount(DungeonCraftEntityGrid, {
      props: baseProps({ table: "roll_tables", ids: ["a", "b", "c"] }),
      slots: { card: cardSlot(vi.fn()) },
    });

    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");
    expect(wrapper.text()).toContain("3 selected");
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

  it("a move calls the bulk-scope mutation with the grid's table and the selected ids", async () => {
    const wrapper = mount(DungeonCraftEntityGrid, {
      props: baseProps({ table: "roll_tables", ids: ["a", "b"] }),
      slots: { card: cardSlot(vi.fn()) },
    });

    await findButton(wrapper, "Select")!.trigger("click");
    await wrapper.get(".card-a").trigger("click"); // select row "a"
    await findButton(wrapper, "Make available in all campaigns")!.trigger("click");

    expect(mocks.mutateAsync).toHaveBeenCalledWith({ table: "roll_tables", ids: ["a"], campaignId: null });
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

  it("prunes at move time even if the reactive watch somehow missed it, so a stale id never reaches the mutation", async () => {
    const wrapper = mount(DungeonCraftEntityGrid, {
      props: baseProps({ table: "roll_tables", ids: ["a", "b"] }),
      slots: { card: cardSlot(vi.fn()) },
    });

    await findButton(wrapper, "Select")!.trigger("click");
    await findButton(wrapper, "Select all shown")!.trigger("click");

    // Row "b" vanishes from the filtered set right as Move is pressed — the
    // component must prune inside handleMove itself, not rely solely on the watcher.
    await wrapper.setProps({ ids: ["a"] });
    await findButton(wrapper, "Move to Curse of Strahd")!.trigger("click");

    expect(mocks.mutateAsync).toHaveBeenCalledWith({ table: "roll_tables", ids: ["a"], campaignId: "camp-1" });
  });

  it("moving to the active campaign passes its id", async () => {
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
