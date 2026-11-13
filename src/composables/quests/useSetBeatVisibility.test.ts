import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSetBeatVisibility } from "./useSetBeatVisibility";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), shareIfBeatSeen: vi.fn() }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useUpdateQuestBeat: () => ({ mutateAsync: mocks.mutateAsync }) }));
vi.mock("@/composables/quests/useShareQuest", () => ({ useShareQuest: () => ({ shareIfBeatSeen: mocks.shareIfBeatSeen }) }));

const beat = { id: "beat-1", quest_id: "quest-1", updated_at: "2026-11-13T00:00:00Z" };

describe("useSetBeatVisibility", () => {
  beforeEach(() => { mocks.mutateAsync.mockReset(); mocks.shareIfBeatSeen.mockReset(); });

  // Fails if the write forgets to auto-share: a rumored beat would sit in a quest nobody can see.
  it("shares the quest after the visibility write succeeds", async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    await useSetBeatVisibility()(beat, "revealed");
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: "beat-1", questId: "quest-1", expectedUpdatedAt: beat.updated_at, update: { visibility: "revealed" } });
    expect(mocks.shareIfBeatSeen).toHaveBeenCalledWith("quest-1", "revealed");
  });

  // Fails if the share runs regardless: a failed write would still announce the quest.
  it("shares nothing when the write fails", async () => {
    mocks.mutateAsync.mockRejectedValue(new Error("conflict"));
    await expect(useSetBeatVisibility()(beat, "rumored")).rejects.toThrow("conflict");
    expect(mocks.shareIfBeatSeen).not.toHaveBeenCalled();
  });
});
