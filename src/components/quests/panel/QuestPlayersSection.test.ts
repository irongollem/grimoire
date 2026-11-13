import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestPlayersSection from "./QuestPlayersSection.vue";
import type { Quest } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  updateQuest: vi.fn(),
  announce: vi.fn(),
  beats: [] as Array<{ id: string; visibility: string }>,
  objectives: [] as Array<{ id: string; is_player_visible: boolean }>,
  activeCampaignId: "campaign-1" as string | null,
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({ useQuestBeats: () => ({ data: { value: mocks.beats } }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  QUESTS_KEY: "quests",
  fetchQuest: vi.fn(),
  useQuestObjectives: () => ({ data: { value: mocks.objectives } }),
  useUpdateQuest: () => ({ mutateAsync: mocks.updateQuest }),
}));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/composables/party/useParty", () => ({ partyListQuery: vi.fn() }));
vi.mock("@/composables/campaign/useCampaignBroadcast", () => ({ sendCampaignAnnouncement: mocks.announce }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: mocks.activeCampaignId }) }));

const base = { id: "quest-1", title: "The Unseen", player_visible_to: [] as string[] } as Quest;

function mountPlayers(overrides: Partial<Quest> = {}) {
  return mount(QuestPlayersSection, {
    props: { quest: { ...base, ...overrides } as Quest },
    global: { stubs: { AudienceRevealControl: true, QuestPlayerPreviewDrawer: true } },
  });
}
const reveal = (w: ReturnType<typeof mountPlayers>, ids: string[]) => w.findComponent({ name: "AudienceRevealControl" }).vm.$emit("change", ids);

describe("QuestPlayersSection", () => {
  beforeEach(() => {
    mocks.updateQuest.mockReset();
    mocks.updateQuest.mockResolvedValue(undefined);
    mocks.announce.mockReset();
    mocks.beats = [];
    mocks.objectives = [];
    mocks.activeCampaignId = "campaign-1";
  });

  // Fails on counting a hidden beat, or an objective the players cannot see, as seen.
  it("counts a beat seen when rumored or revealed, and an objective when player-visible", () => {
    mocks.beats = [{ id: "a", visibility: "hidden" }, { id: "b", visibility: "rumored" }, { id: "c", visibility: "revealed" }];
    mocks.objectives = [{ id: "o1", is_player_visible: true }, { id: "o2", is_player_visible: false }];
    expect(mountPlayers().text()).toContain("See 2 of 3 beats · 1 of 2 objectives");
  });

  it("writes the audience at once and announces only the first share", async () => {
    const wrapper = mountPlayers({ player_visible_to: [] });
    reveal(wrapper, ["p1"]);
    await flushPromises();
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "quest-1", update: { player_visible_to: ["p1"] } });
    expect(mocks.announce).toHaveBeenCalledWith("campaign-1", '📋 Quest shared: "The Unseen"', expect.objectContaining({ entity_type: "quest", entity_id: "quest-1" }));
  });

  it("does not re-announce a quest that is already shared, nor an unshare, nor without a campaign", async () => {
    reveal(mountPlayers({ player_visible_to: ["p1"] }), ["p1", "p2"]);
    reveal(mountPlayers({ player_visible_to: ["p1"] }), []);
    mocks.activeCampaignId = null;
    reveal(mountPlayers({ player_visible_to: [] }), ["p1"]);
    await flushPromises();
    expect(mocks.updateQuest).toHaveBeenCalledTimes(3);
    expect(mocks.announce).not.toHaveBeenCalled();
  });

  it("Preview as… opens the player preview", async () => {
    const wrapper = mountPlayers();
    expect(wrapper.findComponent({ name: "QuestPlayerPreviewDrawer" }).exists()).toBe(false);
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Preview as…")!.trigger("click");
    expect(wrapper.findComponent({ name: "QuestPlayerPreviewDrawer" }).exists()).toBe(true);
  });
});
