import { describe, expect, it } from "vitest";
import { deriveQuestBeatPresentations, visitedRouteEdgeIds } from "./presentation";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatEdge, QuestBeatTransition } from "@/types/quest.types";

const beat = (id: string, visibility: QuestBeat["visibility"] = "hidden") => ({ id, quest_id: "q", campaign_id: "c", title: id, visibility }) as QuestBeat;
const edge = (id: string, source: string, target: string) => ({ id, source_beat_id: source, target_beat_id: target }) as QuestBeatEdge;
const transition = (from: string | null, to: string) => ({ from_beat_id: from, to_beat_id: to }) as QuestBeatTransition;

describe("quest beat presentation", () => {
  it("derives readiness, visibility-independent history, live, handout and disconnected states", () => {
    const attachment = { beat_id: "b", attachment_type: "handout", prep_gap: true } as QuestBeatAttachmentSummary;
    const result = deriveQuestBeatPresentations({
      beats: [beat("a", "revealed"), beat("b", "rumored"), beat("staging")],
      edges: [edge("ab", "a", "b"), edge("ba", "b", "a")],
      attachments: [attachment],
      runtime: { current_beat_id: "b" } as never,
      transitions: [transition(null, "a"), transition("a", "b")],
    });

    expect(result.a).toMatchObject({ isReady: true, isVisited: true, isCurrent: false, isDisconnected: false });
    expect(result.b).toMatchObject({ prepGapCount: 1, handoutCount: 1, isReady: false, isVisited: true, isCurrent: true });
    expect(result.staging.isDisconnected).toBe(true);
  });

  it("marks route history without looping on cycles or convergence", () => {
    const edges = [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a"), edge("dc", "d", "c")];
    expect([...visitedRouteEdgeIds(edges, [transition("a", "b"), transition("b", "c"), transition("c", "a")])]).toEqual(["ab", "bc", "ca"]);
  });
});
