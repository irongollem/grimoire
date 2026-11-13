import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Quest } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  updateQuest: vi.fn(),
  announce: vi.fn(),
  fetchQuest: vi.fn(),
  fetchQuery: vi.fn(),
  party: [] as Array<{ id: string }>,
  campaignId: "c1" as string | null,
}));

vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ fetchQuery: mocks.fetchQuery }) }));
vi.mock("@/composables/campaign/useCampaignBroadcast", () => ({ sendCampaignAnnouncement: mocks.announce }));
vi.mock("@/composables/party/useParty", () => ({ partyListQuery: () => ({ queryKey: ["party"], queryFn: async () => mocks.party }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  QUESTS_KEY: "quests",
  fetchQuest: mocks.fetchQuest,
  useUpdateQuest: () => ({ mutateAsync: mocks.updateQuest }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: mocks.campaignId }) }));

import { useShareQuest } from "./useShareQuest";

const quest = (visibleTo: string[]) => ({ id: "q1", title: "The Unseen", player_visible_to: visibleTo }) as Quest;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.campaignId = "c1";
  mocks.party = [{ id: "p1" }, { id: "p2" }];
  mocks.updateQuest.mockResolvedValue(undefined);
  mocks.fetchQuery.mockImplementation(async (options: { queryKey: string[] }) =>
    options.queryKey[0] === "quests" ? mocks.fetchQuest() : mocks.party);
});

describe("shareIfBeatSeen", () => {
  // Fails if a revealed beat of an unshared quest leaves the quest invisible, or the table is not told.
  it.each(["rumored", "revealed"] as const)("shares an unshared quest with the whole party and announces it when a beat goes %s", async (visibility) => {
    mocks.fetchQuest.mockResolvedValue(quest([]));
    await useShareQuest().shareIfBeatSeen("q1", visibility);
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "q1", update: { player_visible_to: ["p1", "p2"] } });
    expect(mocks.announce).toHaveBeenCalledWith("c1", '📋 Quest shared: "The Unseen"', expect.objectContaining({ entity_id: "q1" }));
  });

  // Fails if a deliberate partial share is widened to the whole party.
  it("leaves a quest the DM shared with some members alone", async () => {
    mocks.fetchQuest.mockResolvedValue(quest(["p1"]));
    await useShareQuest().shareIfBeatSeen("q1", "revealed");
    expect(mocks.updateQuest).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();
  });

  // Fails if hiding a beat shares the quest.
  it("never shares on Hidden", async () => {
    mocks.fetchQuest.mockResolvedValue(quest([]));
    await useShareQuest().shareIfBeatSeen("q1", "hidden");
    expect(mocks.updateQuest).not.toHaveBeenCalled();
  });

  // Fails if an empty party is written as an audience, which would announce a share to nobody.
  it("does nothing when the party is empty", async () => {
    mocks.fetchQuest.mockResolvedValue(quest([]));
    mocks.party = [];
    await useShareQuest().shareIfBeatSeen("q1", "revealed");
    expect(mocks.updateQuest).not.toHaveBeenCalled();
  });

  // Fails if the share announcement is sent without a campaign to send it to.
  it("does nothing without an active campaign", async () => {
    mocks.campaignId = null;
    await useShareQuest().shareIfBeatSeen("q1", "revealed");
    expect(mocks.updateQuest).not.toHaveBeenCalled();
  });
});
