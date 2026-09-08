import { describe, expect, it } from "vitest";
import type { Quest, QuestBeat, QuestRef } from "@/types/quest.types";
import { countQuestBoardFilters, deriveQuestBoardSummaries, filterQuestBoard, type QuestBoardFilters, type QuestBoardSummary } from "./board";

function quest(id: string, overrides: Partial<Quest> = {}): Quest {
  return {
    id,
    user_id: "dm-1",
    campaign_id: "campaign-1",
    parent_quest_id: null,
    title: `Quest ${id}`,
    summary: null,
    status: "active",
    giver_npc_id: null,
    location_id: null,
    tags: [],
    player_visible_to: [],
    started_at: null,
    resolved_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

function ref(questId: string, type: QuestRef["ref_type"], id: string): QuestRef {
  return { id: `${questId}-${id}`, quest_id: questId, ref_type: type, ref_id: id, is_player_visible: false };
}

const emptyFilters: QuestBoardFilters = {
  search: "",
  partyOnly: false,
  entity: "",
  prepGapsOnly: false,
  pendingLootOnly: false,
};

const ready: QuestBoardSummary = {
  isLive: false,
  runtimeStatus: null,
  currentBeatTitle: null,
  beatSegments: [],
  prepGapCount: 0,
  undispatchedLootCount: 0,
  unclaimedLootCount: 0,
  threads: [],
  liveThreadCount: 0,
  primaryThreadId: null,
  prepGaps: [],
  hasPayoffPrepared: false,
  convergesInto: [],
  unlockedBy: null,
  heldPayoffCount: 0,
  settledCaption: null,
};

describe("filterQuestBoard", () => {
  it("composes text and party sharing with AND semantics", () => {
    const quests = [
      quest("a", { title: "Harbour Bell", player_visible_to: ["pc-1"] }),
      quest("b", { title: "Harbour Ledger" }),
      quest("c", { title: "Forest Bell", player_visible_to: ["pc-1"] }),
    ];
    const result = filterQuestBoard(
      quests,
      { ...emptyFilters, search: "harbour", partyOnly: true },
      { refs: [] },
    );
    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("matches primary giver/location and typed quest refs", () => {
    const quests = [
      quest("giver", { giver_npc_id: "npc-1" }),
      quest("primary-location", { location_id: "loc-1" }),
      quest("ref-location"),
      quest("other"),
    ];
    const refs = [ref("ref-location", "location", "loc-1"), ref("other", "faction", "faction-1")];

    expect(filterQuestBoard(
      quests,
      { ...emptyFilters, entity: "npc:npc-1" },
      { refs },
    ).map((item) => item.id)).toEqual(["giver"]);

    expect(filterQuestBoard(
      quests,
      { ...emptyFilters, entity: "location:loc-1" },
      { refs },
    ).map((item) => item.id)).toEqual(["primary-location", "ref-location"]);

    expect(filterQuestBoard(
      quests,
      { ...emptyFilters, entity: "faction:faction-1" },
      { refs },
    ).map((item) => item.id)).toEqual(["other"]);
  });

  it("does not erase quests when beat filters lack authoritative summaries", () => {
    const quests = [quest("legacy-a"), quest("legacy-b")];
    const result = filterQuestBoard(
      quests,
      { ...emptyFilters, prepGapsOnly: true, pendingLootOnly: true },
      { refs: [] },
    );
    expect(result).toEqual(quests);
  });

  it("applies prep and pending-loot filters once summaries are available", () => {
    const quests = [quest("ready"), quest("prep"), quest("loot"), quest("both")];
    const summaries: Record<string, QuestBoardSummary> = {
      ready,
      prep: { ...ready, prepGapCount: 2 },
      loot: { ...ready, unclaimedLootCount: 1 },
      both: { ...ready, prepGapCount: 1, undispatchedLootCount: 3 },
    };

    expect(filterQuestBoard(
      quests,
      { ...emptyFilters, prepGapsOnly: true },
      { refs: [], summaries },
    ).map((item) => item.id)).toEqual(["prep", "both"]);

    expect(filterQuestBoard(
      quests,
      { ...emptyFilters, prepGapsOnly: true, pendingLootOnly: true },
      { refs: [], summaries },
    ).map((item) => item.id)).toEqual(["both"]);
  });

  it("counts each boolean facet with all other active filters composed", () => {
    const quests = [
      quest("ready", { title: "Harbour ready", player_visible_to: ["pc"] }),
      quest("prep", { title: "Harbour prep", player_visible_to: ["pc"] }),
      quest("loot", { title: "Forest loot", player_visible_to: ["pc"] }),
      quest("both", { title: "Harbour both" }),
    ];
    const summaries = {
      ready,
      prep: { ...ready, prepGapCount: 1 },
      loot: { ...ready, unclaimedLootCount: 1 },
      both: { ...ready, prepGapCount: 1, undispatchedLootCount: 1 },
    };
    expect(countQuestBoardFilters(
      quests,
      { ...emptyFilters, search: "harbour" },
      { refs: [], summaries },
    )).toEqual({ party: 2, prepGaps: 2, pendingLoot: 1 });
  });
});

describe("deriveQuestBoardSummaries", () => {
  it("combines live, readiness, history, and loot without card-level fetching", () => {
    const beats = [
      { id: "beat-a", quest_id: "quest-a", title: "Arrival", visibility: "hidden", dm_content: "Ready", how_it_plays: null, is_improvised: false },
      { id: "beat-b", quest_id: "quest-a", title: "Vault", visibility: "hidden", dm_content: "Ready", how_it_plays: null, is_improvised: false },
    ] as QuestBeat[];
    const summaries = deriveQuestBoardSummaries({
      beats,
      edges: [{ source_beat_id: "beat-a", target_beat_id: "beat-b" }] as never[],
      attachments: [{ beat_id: "beat-b", attachment_type: "handout", prep_gap: true }] as never[],
      loot: [{ beat_id: "beat-b", quest_id: "quest-a", delivery_state: "held" }] as never[],
      runtime: [{ quest_id: "quest-a", thread_id: "main", current_beat_id: "beat-a", status: "running" }] as never[],
      transitions: [{ to_beat_id: "beat-a" }] as never[],
    });
    expect(summaries["quest-a"]).toMatchObject({
      isLive: true,
      runtimeStatus: "running",
      currentBeatTitle: "Arrival",
      beatSegments: ["here", "gap"],
      prepGapCount: 1,
      undispatchedLootCount: 1,
    });
  });

  // #853: a quest can hold several live threads at once. The top-level fields
  // read as the first *running* thread's; every thread gets its own entry.
  it("reads the top-level fields off the first running thread, and lists every thread on its own", () => {
    const beats = [
      { id: "beat-a", quest_id: "quest-a", title: "Arrival" },
      { id: "beat-b", quest_id: "quest-a", title: "Side chamber" },
    ] as QuestBeat[];
    const threads = [
      { id: "main", quest_id: "quest-a", campaign_id: "campaign-1", label: "Main", status: "live", created_at: "2026-08-01T00:00:00Z" },
      { id: "side", quest_id: "quest-a", campaign_id: "campaign-1", label: "The lost heir", status: "live", created_at: "2026-08-05T00:00:00Z" },
    ] as never[];
    const summaries = deriveQuestBoardSummaries({
      beats,
      edges: [],
      attachments: [],
      loot: [],
      runtime: [
        { quest_id: "quest-a", thread_id: "side", current_beat_id: "beat-b", status: "paused" },
        { quest_id: "quest-a", thread_id: "main", current_beat_id: "beat-a", status: "running" },
      ] as never[],
      threads,
    });
    const summary = summaries["quest-a"]!;
    expect(summary.isLive).toBe(true);
    expect(summary.liveThreadCount).toBe(1);
    expect(summary.currentBeatTitle).toBe("Arrival");
    expect(summary.primaryThreadId).toBe("main");
    expect(summary.threads).toEqual([
      { id: "side", label: "The lost heir", status: "live", currentBeatTitle: "Side chamber", beatSegments: expect.any(Array), created_at: "2026-08-05T00:00:00Z" },
      { id: "main", label: "Main", status: "live", currentBeatTitle: "Arrival", beatSegments: expect.any(Array), created_at: "2026-08-01T00:00:00Z" },
    ]);
  });

  // Story I (#850): the card has to answer "where is this quest" for more
  // than one cursor, and the log's groups need the facts a "07 Log"-style
  // caption reads off.
  it("names every concrete prep gap, not just the count", () => {
    const beats = [
      { id: "beat-a", quest_id: "quest-a", title: "Arrival", dm_content: "Ready", how_it_plays: null, visibility: "hidden", is_improvised: false },
      { id: "beat-b", quest_id: "quest-a", title: "Vault", dm_content: null, how_it_plays: null, visibility: "hidden", is_improvised: false },
    ] as QuestBeat[];
    const summaries = deriveQuestBoardSummaries({
      beats,
      edges: [{ source_beat_id: "beat-a", target_beat_id: "beat-b" }] as never[],
      attachments: [{ beat_id: "beat-b", attachment_type: "handout", label: "Vallis stat block", prep_gap: true }] as never[],
      loot: [],
    });
    expect(summaries["quest-a"]!.prepGaps).toEqual(["Add DM guidance", "Replace Vallis stat block"]);
  });

  it("reads payoff as prepared from undispatched loot alone", () => {
    const beats = [{ id: "beat-a", quest_id: "quest-a", title: "Arrival", dm_content: "Ready", how_it_plays: null, visibility: "hidden", is_improvised: false }] as QuestBeat[];
    const summaries = deriveQuestBoardSummaries({
      beats,
      edges: [],
      attachments: [],
      loot: [{ beat_id: "beat-a", quest_id: "quest-a", delivery_state: "held" }] as never[],
    });
    expect(summaries["quest-a"]!.hasPayoffPrepared).toBe(true);
  });

  it("reads payoff as prepared from an unfired rule on a beat the party has not reached", () => {
    const beats = [
      { id: "beat-a", quest_id: "quest-a", title: "Arrival", dm_content: "Ready", how_it_plays: null, visibility: "hidden", is_improvised: false },
      { id: "beat-b", quest_id: "quest-a", title: "Reveal", dm_content: "Ready", how_it_plays: null, visibility: "hidden", is_improvised: false },
    ] as QuestBeat[];
    const withRule = deriveQuestBoardSummaries({
      beats,
      edges: [],
      attachments: [],
      loot: [],
      transitions: [{ to_beat_id: "beat-a" }] as never[],
      consequences: [{ id: "c1", quest_id: "quest-a", on_beat_id: "beat-b", action: "reveal", target_objective_id: "obj-1" }] as never[],
    });
    expect(withRule["quest-a"]!.hasPayoffPrepared).toBe(true);

    // The same rule sitting on the beat the party is already standing on has
    // nothing left to prepare — it already fired.
    const alreadyVisited = deriveQuestBoardSummaries({
      beats,
      edges: [],
      attachments: [],
      loot: [],
      transitions: [{ to_beat_id: "beat-b" }] as never[],
      consequences: [{ id: "c1", quest_id: "quest-a", on_beat_id: "beat-b", action: "reveal", target_objective_id: "obj-1" }] as never[],
    });
    expect(alreadyVisited["quest-a"]!.hasPayoffPrepared).toBe(false);
  });

  it("names the beat behind an unlock_quest rule, and holds the rest as unnamed", () => {
    const beats = [
      { id: "beat-source", quest_id: "quest-source", title: "The Vault's Keeper" },
    ] as QuestBeat[];
    const summaries = deriveQuestBoardSummaries({
      beats,
      edges: [],
      attachments: [],
      loot: [],
      consequences: [
        { id: "c1", quest_id: "quest-source", on_beat_id: "beat-source", action: "unlock_quest", target_quest_id: "quest-locked" },
        { id: "c2", quest_id: "quest-other", on_objective_id: "obj-1", action: "unlock_quest", target_quest_id: "quest-locked-2" },
      ] as never[],
    });
    expect(summaries["quest-locked"]!.unlockedBy).toBe("The Vault's Keeper");
    expect(summaries["quest-locked"]!.heldPayoffCount).toBe(0);
    expect(summaries["quest-locked-2"]!.unlockedBy).toBeNull();
    expect(summaries["quest-locked-2"]!.heldPayoffCount).toBe(1);
  });

  it("reads convergesInto off an actual cross-quest transition landing on a converge-all beat", () => {
    const beats = [
      { id: "beat-source", quest_id: "quest-a", title: "Closing scene", converge_mode: "any" },
      { id: "beat-target", quest_id: "quest-b", title: "The main hall", converge_mode: "all" },
    ] as QuestBeat[];
    const summaries = deriveQuestBoardSummaries({
      beats,
      edges: [],
      attachments: [],
      loot: [],
      transitions: [
        { from_quest_id: "quest-a", from_beat_id: "beat-source", to_quest_id: "quest-b", to_beat_id: "beat-target", to_quest_title: "The Tithe of Ashmouth", transition_kind: "forward" },
      ] as never[],
    });
    expect(summaries["quest-a"]!.convergesInto).toEqual(["The Tithe of Ashmouth"]);
    expect(summaries["quest-b"]!.convergesInto).toEqual([]);
  });

  it("reads the settled caption off the last end transition's session note and thread statuses", () => {
    const beats = [{ id: "beat-a", quest_id: "quest-a", title: "Arrival" }] as QuestBeat[];
    const withSessionAndOpenThread = deriveQuestBoardSummaries({
      beats,
      edges: [],
      attachments: [],
      loot: [],
      transitions: [{ from_quest_id: "quest-a", transition_kind: "end", reason: "Session 19, wrapped early", created_at: "2026-08-01T00:00:00Z" }] as never[],
      threads: [{ id: "main", quest_id: "quest-a", campaign_id: "campaign-1", label: "Main", status: "waiting" }] as never[],
    });
    expect(withSessionAndOpenThread["quest-a"]!.settledCaption).toBe("Session 19 · one thread closed unfinished");

    const settledNoSession = deriveQuestBoardSummaries({
      beats,
      edges: [],
      attachments: [],
      loot: [],
      transitions: [{ from_quest_id: "quest-a", transition_kind: "end", reason: null, created_at: "2026-08-01T00:00:00Z" }] as never[],
      threads: [{ id: "main", quest_id: "quest-a", campaign_id: "campaign-1", label: "Main", status: "closed" }] as never[],
    });
    expect(settledNoSession["quest-a"]!.settledCaption).toBe("ledger settled");

    const neverEnded = deriveQuestBoardSummaries({ beats, edges: [], attachments: [], loot: [] });
    expect(neverEnded["quest-a"]!.settledCaption).toBeNull();
  });
});
