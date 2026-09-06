import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LootPlacementList from "./LootPlacementList.vue";
import type { LootPlacement } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  remove: vi.fn(),
  openChatAt: vi.fn(),
}));

vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ openChatAt: mocks.openChatAt }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useDeleteLootPlacement: () => ({ mutateAsync: mocks.remove }),
  useDispatchLoot: () => ({ mutateAsync: mocks.dispatch }),
}));

const loot = (overrides: Partial<LootPlacement> = {}): LootPlacement => ({
  id: "loot-1", beat_id: "beat-1", quest_id: "quest-1", location_id: null, campaign_id: "campaign-1",
  kind: "item", item_id: "item-1", quantity: 2, label: "Moon keys", payload: {},
  source_type: "prepared", source_id: null, sort_order: 0, dispatch_message_id: null,
  dispatched_at: null, delivery_state: "held",
  quantity_remaining: 2, claimed_by_names: [], handed_out_this_session: false,
  ...overrides,
});

describe("LootPlacementList", () => {
  beforeEach(() => {
    mocks.dispatch.mockReset();
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
    expect(mocks.dispatch).toHaveBeenCalledWith({ entryIds: ["loot-1"], campaignId: "campaign-77" });
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
});
