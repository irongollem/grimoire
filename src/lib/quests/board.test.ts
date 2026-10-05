import { describe, expect, it } from "vitest";
import type { Quest, QuestRef } from "@/types/quest.types";
import {
  countQuestBoardFilters,
  deriveQuestBoardSummaries,
  filterQuestBoard,
  type QuestBoardBeat,
  type QuestBoardFilters,
  type QuestBoardPayload,
  type QuestBoardSummary,
} from "./board";

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
    entry_beat_id: null,
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
  entersAt: null,
  heldPayoffCount: 0,
  settledCaption: null,
  objectivesDone: 0,
  objectivesTotal: 0,
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

/** A beat as `get_quest_board` returns it: prepared, hidden, staged nowhere. */
function boardBeat(id: string, questId: string, over: Partial<QuestBoardBeat> = {}): QuestBoardBeat {
  return {
    id,
    quest_id: questId,
    title: id,
    converge_mode: "any",
    visibility: "hidden",
    is_improvised: false,
    improv_reviewed_at: null,
    staged_at_location_id: null,
    has_guidance: true,
    has_rumor_text: false,
    has_reveal_text: false,
    ...over,
  };
}

function payload(over: Partial<QuestBoardPayload>): QuestBoardPayload {
  return {
    beats: [], edges: [], attachments: [], runtime: [], threads: [], visits: [],
    converges: [], endings: [], consequences: [], objectives: [], loot: [],
    ...over,
  };
}

const thread = (id: string, questId: string, over: Partial<QuestBoardPayload["threads"][number]> = {}): QuestBoardPayload["threads"][number] => ({
  id, quest_id: questId, label: "Main", status: "live", created_at: "2026-08-01T00:00:00Z", ...over,
});
const cursor = (questId: string, threadId: string, beatId: string, status: QuestBoardPayload["runtime"][number]["status"] = "running"): QuestBoardPayload["runtime"][number] => ({
  quest_id: questId, thread_id: threadId, current_beat_id: beatId, status,
});
const consequence = (over: Partial<QuestBoardPayload["consequences"][number]>): QuestBoardPayload["consequences"][number] => ({
  quest_id: "quest-a", on_beat_id: null, action: "reveal", target_quest_id: null, entry_beat_id: null, ...over,
});

describe("deriveQuestBoardSummaries", () => {
  it("combines live, readiness, history, and loot without card-level fetching", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-a", "quest-a", { title: "Arrival" }), boardBeat("beat-b", "quest-a", { title: "Vault" })],
      edges: [{ source_beat_id: "beat-a", target_beat_id: "beat-b" }],
      attachments: [{ beat_id: "beat-b", quest_id: "quest-a", attachment_type: "handout", is_required: true, target_exists: false }],
      loot: [{ quest_id: "quest-a", delivery_state: "held" }],
      runtime: [cursor("quest-a", "main", "beat-a")],
      visits: [{ thread_id: "main", beat_id: "beat-a" }],
    }));
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
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-a", "quest-a", { title: "Arrival" }), boardBeat("beat-b", "quest-a", { title: "Side chamber" })],
      runtime: [cursor("quest-a", "side", "beat-b", "paused"), cursor("quest-a", "main", "beat-a")],
      threads: [
        thread("main", "quest-a"),
        thread("side", "quest-a", { label: "The lost heir", created_at: "2026-08-05T00:00:00Z" }),
      ],
    }));
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

  // Frame "07 Log" draws one spine per thread: a beat is "done" on a
  // thread's spine only when that thread walked it, so a layer opened last
  // session reads as one beat in rather than inheriting Main's progress.
  it("reads each thread's spine from that thread's own visits", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-a", "quest-a"), boardBeat("beat-b", "quest-a"), boardBeat("beat-c", "quest-a")],
      runtime: [cursor("quest-a", "main", "beat-b"), cursor("quest-a", "side", "beat-c")],
      visits: [
        { thread_id: "main", beat_id: "beat-a" },
        { thread_id: "main", beat_id: "beat-b" },
        { thread_id: "side", beat_id: "beat-c" },
      ],
      threads: [thread("main", "quest-a"), thread("side", "quest-a", { label: "Side", created_at: "2026-08-05T00:00:00Z" })],
    }));
    const byId = Object.fromEntries(summaries["quest-a"]!.threads.map((t) => [t.id, t.beatSegments]));
    expect(byId.main).toEqual(["done", "here", "gap"]);
    expect(byId.side).toEqual(["gap", "gap", "here"]);
  });

  it("counts a visit from before threads existed (no thread) as done on every thread", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-a", "quest-a"), boardBeat("beat-b", "quest-a")],
      runtime: [cursor("quest-a", "main", "beat-b")],
      visits: [{ thread_id: null, beat_id: "beat-a" }],
      threads: [thread("main", "quest-a")],
    }));
    expect(summaries["quest-a"]!.beatSegments).toEqual(["done", "here"]);
  });

  // Story I (#850): the card has to answer "where is this quest" for more
  // than one cursor, and the log's groups need the facts a "07 Log"-style
  // caption reads off.
  it("names every concrete prep gap, not just the count", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-a", "quest-a"), boardBeat("beat-b", "quest-a", { has_guidance: false })],
      edges: [{ source_beat_id: "beat-a", target_beat_id: "beat-b" }],
      attachments: [{ beat_id: "beat-b", quest_id: "quest-a", attachment_type: "handout", is_required: true, target_exists: false }],
    }));
    expect(summaries["quest-a"]!.prepGaps).toEqual(["Add DM guidance", "Replace Missing handout"]);
  });

  it("raises no attachment gap for an optional or still-present target", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-a", "quest-a")],
      attachments: [
        { beat_id: "beat-a", quest_id: "quest-a", attachment_type: "handout", is_required: false, target_exists: false },
        { beat_id: "beat-a", quest_id: "quest-a", attachment_type: "npc", is_required: true, target_exists: true },
      ],
    }));
    expect(summaries["quest-a"]!.prepGaps).toEqual([]);
  });

  it("asks for copy only when a rumored or revealed beat has none written", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [
        boardBeat("rumor", "quest-a", { visibility: "rumored" }),
        boardBeat("reveal", "quest-a", { visibility: "revealed", has_reveal_text: true }),
      ],
      edges: [{ source_beat_id: "rumor", target_beat_id: "reveal" }],
    }));
    expect(summaries["quest-a"]!.prepGaps).toEqual(["Add explicit rumor copy"]);
  });

  it("reads payoff as prepared from undispatched loot alone", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-a", "quest-a")],
      loot: [{ quest_id: "quest-a", delivery_state: "held" }],
    }));
    expect(summaries["quest-a"]!.hasPayoffPrepared).toBe(true);
  });

  it("reads payoff as prepared from an unfired rule on a beat the party has not reached", () => {
    const beats = [boardBeat("beat-a", "quest-a"), boardBeat("beat-b", "quest-a")];
    const rule = consequence({ on_beat_id: "beat-b" });
    const withRule = deriveQuestBoardSummaries(payload({
      beats,
      visits: [{ thread_id: null, beat_id: "beat-a" }],
      consequences: [rule],
    }));
    expect(withRule["quest-a"]!.hasPayoffPrepared).toBe(true);

    // The same rule sitting on the beat the party is already standing on has
    // nothing left to prepare — it already fired.
    const alreadyVisited = deriveQuestBoardSummaries(payload({
      beats,
      visits: [{ thread_id: null, beat_id: "beat-b" }],
      consequences: [rule],
    }));
    expect(alreadyVisited["quest-a"]!.hasPayoffPrepared).toBe(false);
  });

  it("names the beat behind an unlock_quest rule, and holds the rest as unnamed", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-source", "quest-source", { title: "The Vault's Keeper" })],
      consequences: [
        consequence({ quest_id: "quest-source", on_beat_id: "beat-source", action: "unlock_quest", target_quest_id: "quest-locked" }),
        consequence({ quest_id: "quest-other", action: "unlock_quest", target_quest_id: "quest-locked-2" }),
      ],
    }));
    expect(summaries["quest-locked"]!.unlockedBy).toBe("The Vault's Keeper");
    expect(summaries["quest-locked"]!.heldPayoffCount).toBe(0);
    expect(summaries["quest-locked-2"]!.unlockedBy).toBeNull();
    expect(summaries["quest-locked-2"]!.heldPayoffCount).toBe(1);
  });

  // #871: a bridge can name where the party comes in through it, distinct
  // from the beat that raised the unlock (`unlockedBy`). Both beats belong to
  // `input.beats` already — the entry beat is one of the *target* quest's own
  // beats, campaign-wide data the caller already assembled.
  it("names the entry a bridge lands on, distinct from the beat that raised it", () => {
    const beats = [
      boardBeat("beat-source", "quest-source", { title: "The Vault's Keeper" }),
      boardBeat("beat-locked-entry", "quest-locked", { title: "The sealed antechamber" }),
    ];
    const unlock = { quest_id: "quest-source", on_beat_id: "beat-source", action: "unlock_quest" as const, target_quest_id: "quest-locked" };
    const withEntry = deriveQuestBoardSummaries(payload({
      beats,
      consequences: [consequence({ ...unlock, entry_beat_id: "beat-locked-entry" })],
    }));
    expect(withEntry["quest-locked"]!.unlockedBy).toBe("The Vault's Keeper");
    expect(withEntry["quest-locked"]!.entersAt).toBe("The sealed antechamber");

    // Null `entry_beat_id` means "the target's own entry" — nothing extra to name.
    const withoutEntry = deriveQuestBoardSummaries(payload({
      beats,
      consequences: [consequence({ ...unlock, entry_beat_id: null })],
    }));
    expect(withoutEntry["quest-locked"]!.entersAt).toBeNull();
  });

  it("reads convergesInto off the cross-quest arrivals the server kept", () => {
    const summaries = deriveQuestBoardSummaries(payload({
      beats: [boardBeat("beat-source", "quest-a"), boardBeat("beat-target", "quest-b", { converge_mode: "all" })],
      converges: [{ quest_id: "quest-a", title: "The Tithe of Ashmouth" }],
    }));
    expect(summaries["quest-a"]!.convergesInto).toEqual(["The Tithe of Ashmouth"]);
    expect(summaries["quest-b"]!.convergesInto).toEqual([]);
  });

  it("reads the settled caption off the ending's session note and thread statuses", () => {
    const beats = [boardBeat("beat-a", "quest-a")];
    const withSessionAndOpenThread = deriveQuestBoardSummaries(payload({
      beats,
      endings: [{ quest_id: "quest-a", reason: "Session 19, wrapped early" }],
      threads: [thread("main", "quest-a", { status: "waiting" })],
    }));
    expect(withSessionAndOpenThread["quest-a"]!.settledCaption).toBe("Session 19 · one thread closed unfinished");

    const settledNoSession = deriveQuestBoardSummaries(payload({
      beats,
      endings: [{ quest_id: "quest-a", reason: null }],
      threads: [thread("main", "quest-a", { status: "closed" })],
    }));
    expect(settledNoSession["quest-a"]!.settledCaption).toBe("ledger settled");

    const neverEnded = deriveQuestBoardSummaries(payload({ beats }));
    expect(neverEnded["quest-a"]!.settledCaption).toBeNull();
  });

  // Frame `07 Log`'s featured-card statblock reads "Objectives 1 / 3" — done
  // counts only `status: "complete"`, and a quest with none gets a
  // zero/zero the card knows to hide rather than a missing field.
  it("counts complete objectives against the quest's total", () => {
    const beats = [boardBeat("beat-a", "quest-a")];
    const summaries = deriveQuestBoardSummaries(payload({
      beats,
      objectives: [
        { quest_id: "quest-a", status: "complete" },
        { quest_id: "quest-a", status: "pending" },
        { quest_id: "quest-a", status: "failed" },
      ],
    }));
    expect(summaries["quest-a"]!.objectivesDone).toBe(1);
    expect(summaries["quest-a"]!.objectivesTotal).toBe(3);

    const withoutObjectives = deriveQuestBoardSummaries(payload({ beats }));
    expect(withoutObjectives["quest-a"]!.objectivesDone).toBe(0);
    expect(withoutObjectives["quest-a"]!.objectivesTotal).toBe(0);
  });
});
