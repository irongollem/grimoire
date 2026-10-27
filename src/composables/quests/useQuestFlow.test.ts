import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { invalidatePlayerQuestBeatProjections, prepareQuestBeatOptimisticUpdate } from "./useQuestFlow";
import type { QuestBeat } from "@/types/quest.types";

const beat = { id: "beat", canvas_x: 10, canvas_y: 20 } as QuestBeat;

describe("quest beat optimistic position save", () => {
  it("keeps an exact rollback snapshot when applying coordinates", () => {
    const other = { id: "other", canvas_x: 1, canvas_y: 2 } as QuestBeat;
    const rows = [beat, other];
    const snapshot = prepareQuestBeatOptimisticUpdate(rows, "beat", { canvas_x: 99, canvas_y: -4 });
    expect(snapshot.optimistic?.[0]).toMatchObject({ canvas_x: 99, canvas_y: -4 });
    // Only the dragged beat moves.
    expect(snapshot.optimistic?.[1]).toEqual(other);
    expect(snapshot.previous).toBe(rows);
    expect(snapshot.previous?.[0]).toMatchObject({ canvas_x: 10, canvas_y: 20 });
  });

  it("has nothing to roll back to or show before the beats have loaded", () => {
    expect(prepareQuestBeatOptimisticUpdate(undefined, "beat", { canvas_x: 1 })).toEqual({
      previous: undefined,
      optimistic: undefined,
    });
  });
});

describe("invalidatePlayerQuestBeatProjections", () => {
  it("invalidates every audience cache without invalidating the authored quest cache", async () => {
    const queryClient = new QueryClient();
    const playerOne = ["quest_beats", "player", "campaign", "quest", "player-one"];
    const playerTwo = ["quest_beats", "player", "campaign", "quest", "player-two"];
    const authored = ["quest_beats", "quest"];
    queryClient.setQueryData(playerOne, []);
    queryClient.setQueryData(playerTwo, []);
    queryClient.setQueryData(authored, []);

    await invalidatePlayerQuestBeatProjections(queryClient);

    expect(queryClient.getQueryState(playerOne)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(playerTwo)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(authored)?.isInvalidated).toBe(false);
  });
});
