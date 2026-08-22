import { describe, expect, it } from "vitest";
import { deriveQuestBeatPrepGaps, deriveQuestBeatPresentations, forwardReachableBeatIds, tallyQuestReach, visitedRouteEdgeIds } from "./presentation";
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
      runtime: [{ quest_id: "q", current_beat_id: "b" }] as never[],
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
      { kind: "player_copy", label: "Add reveal copy — players see nothing without it" },
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

  it("separates what is still ahead from what the run has walked past", () => {
    // a -> b -> {c, d}; the party took b -> c, so d is prepared, wired, and
    // unreachable — the case a graph cannot show on its own.
    const result = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b"), beat("c"), beat("d"), beat("e")],
      edges: [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("bd", "b", "d"), edge("ce", "c", "e")],
      attachments: [],
      runtime: [{ quest_id: "q", current_beat_id: "c" }] as never[],
      transitions: [transition(null, "a"), transition("a", "b"), transition("b", "c")],
    });

    expect(result.a.reach).toBe("visited");
    expect(result.b.reach).toBe("visited");
    expect(result.c.reach).toBe("current");
    expect(result.d.reach).toBe("stranded");
    expect(result.e.reach).toBe("ahead");
    expect(tallyQuestReach(result)).toEqual({ visited: 3, ahead: 1, stranded: 1 });
  });

  // The case a single campaign-wide cursor could not express: two givers send the
  // party to the same cave, so both chains are genuinely being advanced at once.
  it("marks a beat current in every chain that is live, not just one", () => {
    const other = (id: string) => ({ ...beat(id), quest_id: "relic-hunt" }) as QuestBeat;
    const result = deriveQuestBeatPresentations({
      beats: [beat("boss-door"), beat("boss"), other("side-chamber"), other("relic")],
      edges: [edge("bd", "boss-door", "boss"), edge("sr", "side-chamber", "relic")],
      attachments: [],
      runtime: [
        { quest_id: "q", current_beat_id: "boss-door" },
        { quest_id: "relic-hunt", current_beat_id: "side-chamber" },
      ] as never[],
      transitions: [],
    });

    expect(result["boss-door"].isCurrent).toBe(true);
    expect(result["side-chamber"].isCurrent).toBe(true);
    // Each live chain contributes its own forward reach, so neither quest's
    // upcoming beats read as cut off just because the other one is on screen.
    expect(result.boss.reach).toBe("ahead");
    expect(result.relic.reach).toBe("ahead");
  });

  it("leaves a chain with no cursor entirely out of the run", () => {
    const result = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b"), { ...beat("untouched"), quest_id: "dormant" } as QuestBeat],
      edges: [edge("ab", "a", "b")],
      attachments: [],
      runtime: [{ quest_id: "q", current_beat_id: "a" }] as never[],
      transitions: [transition(null, "a")],
    });
    expect(result.untouched.reach).toBe("unplayed");
    expect(result.b.reach).toBe("ahead");
  });

  it("re-opens a branch the party can loop back to, and stays quiet outside the run", () => {
    const looping = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b"), beat("side")],
      edges: [edge("ab", "a", "b"), edge("ba", "b", "a"), edge("aside", "a", "side")],
      attachments: [],
      runtime: [{ quest_id: "q", current_beat_id: "b" }] as never[],
      transitions: [transition(null, "a"), transition("a", "b")],
    });
    // b -> a -> side is still walkable, so the untaken branch is not cut off.
    expect(looping.side.reach).toBe("ahead");

    const overview = { ...beat("overview"), is_overview: true } as QuestBeat;
    const elsewhere = deriveQuestBeatPresentations({
      beats: [overview, beat("a"), beat("b"), { ...beat("other"), quest_id: "other-quest" } as QuestBeat],
      edges: [edge("ab", "a", "b")],
      attachments: [],
      runtime: [{ quest_id: "q", current_beat_id: "a" }] as never[],
      transitions: [transition(null, "a")],
    });
    // The quest-level overview and another quest's beats are not "cut off".
    expect(elsewhere.overview.reach).toBe("unplayed");
    expect(elsewhere.other.reach).toBe("unplayed");

    // No run in progress at all: nothing is ahead of or behind anybody.
    const idle = deriveQuestBeatPresentations({ beats: [beat("a"), beat("b")], edges: [edge("ab", "a", "b")], attachments: [] });
    expect(idle.a.reach).toBe("unplayed");
    expect(tallyQuestReach(idle)).toEqual({ visited: 0, ahead: 0, stranded: 0 });
  });

  it("walks edges forward without stalling on a cycle", () => {
    const edges = [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a")];
    expect([...forwardReachableBeatIds("a", edges)].sort()).toEqual(["a", "b", "c"]);
    expect([...forwardReachableBeatIds("lonely", edges)]).toEqual([]);
  });

  it("marks route history without looping on cycles or convergence", () => {
    const edges = [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a"), edge("dc", "d", "c")];
    expect([...visitedRouteEdgeIds(edges, [transition("a", "b"), transition("b", "c"), transition("c", "a")])]).toEqual(["ab", "bc", "ca"]);
  });
});
