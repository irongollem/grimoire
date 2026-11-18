import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LootPlacementList from "./LootPlacementList.vue";
import type { LootPlacement } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  answer: vi.fn(),
  remove: vi.fn(),
  openChatAt: vi.fn(),
}));

vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ openChatAt: mocks.openChatAt }) }));
vi.mock("@/composables/quests/useLootBatchChoice", () => ({ useLootBatchChoice: () => ({ answerFor: mocks.answer }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useDeleteLootPlacement: () => ({ mutateAsync: mocks.remove }),
  useDispatchLoot: () => ({ mutateAsync: mocks.dispatch }),
}));

const loot = (overrides: Partial<LootPlacement> = {}): LootPlacement => ({
  id: "loot-1", beat_id: "beat-1", quest_id: "quest-1", location_id: null, campaign_id: "campaign-1",
  kind: "item", item_id: "item-1", library_item_id: null, quantity: 2, label: "Moon keys", payload: {},
  source_type: "prepared", source_id: null, sort_order: 0, dispatch_message_id: null,
  dispatched_at: null, delivery_state: "held",
  quantity_remaining: 2, claimed_by_names: [], handed_out_this_session: false,
  ...overrides,
});

describe("LootPlacementList", () => {
  beforeEach(() => {
    mocks.dispatch.mockReset();
    mocks.answer.mockReset();
    mocks.answer.mockResolvedValue({ cancelled: false });
    mocks.remove.mockReset();
    mocks.openChatAt.mockReset();
  });

  it("renders the given title and an empty-state label with no entries", () => {
    const wrapper = mount(LootPlacementList, { props: { title: "Room loot", emptyLabel: "Nothing here.", loot: [] } });
    expect(wrapper.text()).toContain("Room loot");
    expect(wrapper.text()).toContain("Nothing here.");
  });

  it("derives campaignId per entry so it never needs a beat or a room to dispatch", async () => {
    mocks.dispatch.mockResolvedValue([]);
    const wrapper = mount(LootPlacementList, {
      props: { title: "Room loot", emptyLabel: "Nothing here.", loot: [loot({ campaign_id: "campaign-77" })] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Drop")!.trigger("click");
    expect(mocks.dispatch).toHaveBeenCalledWith({ entryIds: ["loot-1"], campaignId: "campaign-77", choice: undefined });
  });

  it("Drop all asks about every held entry once and sends the Give choice (fails if it asks per entry or drops the choice)", async () => {
    const choice = { mode: "give", partyMemberId: "pm-1" };
    mocks.answer.mockResolvedValue({ cancelled: false, choice });
    mocks.dispatch.mockResolvedValue([]);
    const held = [loot({ id: "a", label: "Key" }), loot({ id: "b", label: "Purse", kind: "currency" })];
    const wrapper = mount(LootPlacementList, { props: { title: "Room loot", emptyLabel: "Nothing here.", loot: held } });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Drop all")!.trigger("click");
    await flushPromises();
    expect(mocks.answer).toHaveBeenCalledTimes(1);
    expect(mocks.answer).toHaveBeenCalledWith(held);
    expect(mocks.dispatch).toHaveBeenCalledWith({ entryIds: ["a", "b"], campaignId: "campaign-1", choice });
  });

  it("cancelling the question drops nothing and shows no error (fails if a cancelled ask still posts)", async () => {
    mocks.answer.mockResolvedValue({ cancelled: true });
    const wrapper = mount(LootPlacementList, { props: { title: "Room loot", emptyLabel: "Nothing here.", loot: [loot()] } });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Drop")!.trigger("click");
    await flushPromises();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(wrapper.emitted("dropped")).toBeUndefined();
  });

  it("emits dropped after a successful dispatch, for a caller to react to", async () => {
    mocks.dispatch.mockResolvedValue([]);
    const wrapper = mount(LootPlacementList, {
      props: { title: "Room loot", emptyLabel: "Nothing here.", loot: [loot()] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Drop")!.trigger("click");
    expect(wrapper.emitted("dropped")).toHaveLength(1);
  });

  it("does not emit dropped when the dispatch call fails", async () => {
    mocks.dispatch.mockRejectedValue(new Error("boom"));
    const wrapper = mount(LootPlacementList, {
      props: { title: "Room loot", emptyLabel: "Nothing here.", loot: [loot()] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Drop")!.trigger("click");
    expect(wrapper.emitted("dropped")).toBeUndefined();
    expect(wrapper.text()).toContain("boom");
  });

  it("removes a held entry using its own campaign id", async () => {
    mocks.remove.mockResolvedValue(undefined);
    const wrapper = mount(LootPlacementList, {
      props: { title: "Room loot", emptyLabel: "Nothing here.", loot: [loot({ campaign_id: "campaign-9" })] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Remove")!.trigger("click");
    expect(mocks.remove).toHaveBeenCalledWith({ id: "loot-1", campaignId: "campaign-9" });
  });

  it("opens the originating chat card for dispatched loot", async () => {
    const wrapper = mount(LootPlacementList, {
      props: {
        title: "Room loot",
        emptyLabel: "Nothing here.",
        loot: [loot({ delivery_state: "chat", dispatch_message_id: "message-1", dispatched_at: "2026-09-01T00:00:00Z" })],
      },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Open chat card")!.trigger("click");
    expect(mocks.openChatAt).toHaveBeenCalledWith("message-1");
  });

  const btn = (w: ReturnType<typeof mount>, label: string) => w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!;

  it("Drop all sends every held entry in one call and leaves dispatched and claimed loot out", async () => {
    mocks.dispatch.mockResolvedValue([]);
    const wrapper = mount(LootPlacementList, {
      props: {
        title: "Beat loot", emptyLabel: "Nothing here.",
        loot: [
          loot({ id: "a" }),
          loot({ id: "b", delivery_state: "chat", dispatch_message_id: "m1" }),
          loot({ id: "c", delivery_state: "claimed", dispatch_message_id: "m2" }),
          loot({ id: "d", label: "Silver" }),
        ],
      },
    });
    await btn(wrapper, "Drop all").trigger("click");
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledWith({ entryIds: ["a", "d"], campaignId: "campaign-1" });
  });

  it("offers Drop all only while something is held", () => {
    const wrapper = mount(LootPlacementList, {
      props: { title: "Beat loot", emptyLabel: "Nothing here.", loot: [loot({ delivery_state: "claimed", dispatch_message_id: "m2" })] },
    });
    expect(wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Drop all")).toBeUndefined();
  });

  it("shows a Drop in flight as loading on its own row only, and settles when it finishes", async () => {
    let finish: (v: unknown[]) => void = () => {};
    mocks.dispatch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const wrapper = mount(LootPlacementList, {
      props: { title: "Beat loot", emptyLabel: "Nothing here.", loot: [loot({ id: "a" }), loot({ id: "b" })] },
    });
    const drops = () => wrapper.findAllComponents({ name: "AppButton" }).filter((b) => b.props("label") === "Drop");
    await drops()[1]!.trigger("click");
    expect(mocks.dispatch).toHaveBeenCalledWith({ entryIds: ["b"], campaignId: "campaign-1" });
    expect(drops()[1]!.props("loading")).toBe(true);
    expect(drops()[0]!.props("loading")).toBe(false);
    finish([]);
    await flushPromises();
    expect(drops()[1]!.props("loading")).toBe(false);
  });

  it("shows a Remove in flight as loading, settles after a failure, and a retry clears the old error", async () => {
    mocks.remove.mockRejectedValueOnce("not an Error").mockResolvedValue(undefined);
    const wrapper = mount(LootPlacementList, {
      props: { title: "Beat loot", emptyLabel: "Nothing here.", loot: [loot()] },
    });
    await btn(wrapper, "Remove").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not remove loot");
    expect(btn(wrapper, "Remove").props("loading")).toBe(false);
    await btn(wrapper, "Remove").trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
