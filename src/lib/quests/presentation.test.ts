import { describe, expect, it } from "vitest";
import { deriveQuestBeatPrepGaps, deriveQuestBeatPresentations, visitedRouteEdgeIds } from "./presentation";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatEdge, QuestBeatTransition } from "@/types/quest.types";

const beat = (id: string, visibility: QuestBeat["visibility"] = "hidden") => ({
  id, quest_id: "q", campaign_id: "c", title: id, visibility,
  dm_content: "Prepared guidance", how_it_plays: null,
  rumor_text: visibility === "rumored" ? "Safe rumor" : null,
  reveal_text: visibility === "revealed" ? "Safe reveal" : null,
  is_improvised: false, improv_reviewed_at: null,
}) as QuestBeat;
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
    expect(result.staging.prepGaps).toEqual([{ kind: "connection", label: "Connect this staging beat to the story flow" }]);
  });

  it("uses one typed readiness rule for narrative, visibility, attachments and improv", () => {
    const draft = {
      ...beat("draft", "revealed"), dm_content: null, how_it_plays: null, reveal_text: null,
      is_improvised: true, improv_reviewed_at: null,
    };
    const required = { prep_gap: true, label: "Missing map" } as QuestBeatAttachmentSummary;
    const optional = { prep_gap: false, label: "Optional sound" } as QuestBeatAttachmentSummary;
    expect(deriveQuestBeatPrepGaps(draft, [required, optional], { isDisconnected: true })).toEqual([
      { kind: "guidance", label: "Add DM guidance" },
      { kind: "player_copy", label: "Add explicit reveal copy" },
      { kind: "attachment", label: "Replace Missing map" },
      { kind: "improv_review", label: "Review improvised beat" },
      { kind: "connection", label: "Connect this staging beat to the story flow" },
    ]);
    expect(deriveQuestBeatPrepGaps({ ...draft, visibility: "hidden", how_it_plays: "Skill challenge" }, [])).toEqual([
      { kind: "improv_review", label: "Review improvised beat" },
    ]);
  });

  it("scopes connectivity per quest and never stages the quest-level overview beat", () => {
    const overview = { ...beat("overview"), is_overview: true } as QuestBeat;
    const result = deriveQuestBeatPresentations({
      // Campaign-wide input, as the board passes it: quest "q" has two wired
      // flow beats, quest "other" has a single beat that cannot be connected.
      beats: [overview, beat("a"), beat("b"), { ...beat("lonely"), quest_id: "other" } as QuestBeat],
      edges: [edge("ab", "a", "b")],
      attachments: [],
    });

    expect(result.overview.isDisconnected).toBe(false);
    expect(result.overview.prepGaps).toEqual([]);
    expect(result.lonely.isDisconnected).toBe(false);
    expect(result.a.isDisconnected).toBe(false);
  });

  it("marks route history without looping on cycles or convergence", () => {
    const edges = [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a"), edge("dc", "d", "c")];
    expect([...visitedRouteEdgeIds(edges, [transition("a", "b"), transition("b", "c"), transition("c", "a")])]).toEqual(["ab", "bc", "ca"]);
  });
});
