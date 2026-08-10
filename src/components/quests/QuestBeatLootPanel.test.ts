import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatLootPanel from "./QuestBeatLootPanel.vue";
import type { QuestBeat, QuestBeatLoot } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  openChatAt: vi.fn(),
}));

vi.mock("@/composables/useItems", () => ({ useItems: () => ({ data: { value: [] } }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "dm" } }) }));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ openChatAt: mocks.openChatAt }) }));
vi.mock("@/composables/useQuestFlow", () => ({
  useCreateQuestBeatLoot: () => ({ mutateAsync: vi.fn() }),
  useDeleteQuestBeatLoot: () => ({ mutateAsync: vi.fn() }),
  useDispatchQuestBeatLoot: () => ({ mutateAsync: mocks.dispatch }),
}));

const beat = {
  id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "Reward",
} as QuestBeat;

const loot = (overrides: Partial<QuestBeatLoot> = {}): QuestBeatLoot => ({
  id: "loot-1", beat_id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1",
  kind: "item", item_id: "item-1", quantity: 2, label: "Moon keys", payload: {},
  source_type: "prepared", source_id: null, sort_order: 0, dispatch_message_id: "message-1",
  dispatched_at: "2026-08-10T00:00:00Z", delivery_state: "partially_claimed",
  quantity_remaining: 1, claimed_by_names: ["Mira"], handed_out_this_session: true,
  ...overrides,
});

describe("QuestBeatLootPanel", () => {
  beforeEach(() => {
    mocks.dispatch.mockReset();
    mocks.openChatAt.mockReset();
  });

  it("shows authoritative live claim detail and opens the originating chat card", async () => {
    const wrapper = shallowMount(QuestBeatLootPanel, { props: { beat, loot: [loot()] } });
    expect(wrapper.text()).toContain("1 remaining · Mira · this session");
    expect(wrapper.text()).toContain("Reassignment is not available in Run mode");
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open chat card")!.trigger("click");
    expect(mocks.openChatAt).toHaveBeenCalledWith("message-1");
  });

  it("dispatches all held rows through the one batch RPC call", async () => {
    mocks.dispatch.mockResolvedValue([]);
    const wrapper = shallowMount(QuestBeatLootPanel, {
      props: { beat, loot: [loot({ dispatch_message_id: null, dispatched_at: null, delivery_state: "held", quantity_remaining: 2, claimed_by_names: [], handed_out_this_session: false })] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Drop all")!.trigger("click");
    expect(mocks.dispatch).toHaveBeenCalledWith({ beatId: "beat-1", entryId: undefined, campaignId: "campaign-1" });
  });

  it("keeps preparation controls inside the narrow beat inspector", () => {
    const wrapper = shallowMount(QuestBeatLootPanel, { props: { beat, loot: [] } });
    const form = wrapper.get('[data-testid="beat-loot-form"]');
    expect(form.classes()).toContain("min-w-0");
    expect(form.classes()).toContain("grid-cols-[minmax(0,8rem)_minmax(0,1fr)]");
    expect(form.find("div.col-span-2").exists()).toBe(true);
  });
});
