import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSetBeatVisibility } from "./useSetBeatVisibility";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useUpdateQuestBeat: () => ({ mutateAsync: mocks.mutateAsync }) }));

const beat = { id: "beat-1", quest_id: "quest-1", updated_at: "2026-11-13T00:00:00Z" };

describe("useSetBeatVisibility", () => {
  beforeEach(() => { mocks.mutateAsync.mockReset(); });

  // Fails if the write drops the optimistic-lock stamp or writes anything but the visibility.
  it("writes only the beat's visibility, against the stamp it was read at", async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    await useSetBeatVisibility()(beat, "revealed");
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: "beat-1", questId: "quest-1", expectedUpdatedAt: beat.updated_at, update: { visibility: "revealed" } });
  });

  // Fails if a conflict is swallowed: the DM would think the beat changed.
  it("lets a failed write reach the caller", async () => {
    mocks.mutateAsync.mockRejectedValue(new Error("conflict"));
    await expect(useSetBeatVisibility()(beat, "rumored")).rejects.toThrow("conflict");
  });
});
