import { describe, expect, it } from "vitest";
import { prepareQuestBeatOptimisticUpdate } from "./useQuestFlow";
import type { QuestBeat } from "@/types/quest.types";

const beat = { id: "beat", canvas_x: 10, canvas_y: 20 } as QuestBeat;

describe("quest beat optimistic position save", () => {
  it("keeps an exact rollback snapshot when applying coordinates", () => {
    const rows = [beat];
    const snapshot = prepareQuestBeatOptimisticUpdate(rows, "beat", { canvas_x: 99, canvas_y: -4 });
    expect(snapshot.optimistic?.[0]).toMatchObject({ canvas_x: 99, canvas_y: -4 });
    expect(snapshot.previous).toBe(rows);
    expect(snapshot.previous?.[0]).toMatchObject({ canvas_x: 10, canvas_y: 20 });
  });
});
