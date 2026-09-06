import { describe, expect, it } from "vitest";
import { isDuplicateQuestEdge } from "./mutations";
import type { QuestBeatEdge } from "@/types/quest.types";

describe("quest graph mutations", () => {
  it("accepts cycles and convergence but rejects self-links and any repeated pair", () => {
    const edges = [{ source_beat_id: "a", target_beat_id: "b" }] as QuestBeatEdge[];
    expect(isDuplicateQuestEdge(edges, "a", "a")).toBe(true);
    expect(isDuplicateQuestEdge(edges, "a", "b")).toBe(true);
    expect(isDuplicateQuestEdge(edges, "b", "a")).toBe(false);
    expect(isDuplicateQuestEdge(edges, "c", "b")).toBe(false);
  });
});
