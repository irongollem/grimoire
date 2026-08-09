import { describe, expect, it, vi } from "vitest";
import { createBeatWithRollback, isDuplicateQuestEdge } from "./mutations";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const beat = { id: "new" } as QuestBeat;
describe("quest graph mutations", () => {
  it("rolls a created beat back visibly when its connecting edge fails", async () => {
    const rollback = vi.fn().mockResolvedValue(undefined);
    await expect(createBeatWithRollback(async () => beat, async () => { throw new Error("duplicate"); }, rollback)).rejects.toThrow("duplicate");
    expect(rollback).toHaveBeenCalledWith(beat);
  });
  it("accepts cycles and convergence but rejects self and exact unlabeled duplicates", () => {
    const edges = [{ source_beat_id: "a", target_beat_id: "b", label: "" }] as QuestBeatEdge[];
    expect(isDuplicateQuestEdge(edges, "a", "a")).toBe(true);
    expect(isDuplicateQuestEdge(edges, "a", "b")).toBe(true);
    expect(isDuplicateQuestEdge(edges, "b", "a")).toBe(false);
    expect(isDuplicateQuestEdge(edges, "c", "b")).toBe(false);
  });
});
