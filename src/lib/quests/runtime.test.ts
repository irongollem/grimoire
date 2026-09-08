import { describe, expect, it } from "vitest";
import { toQuestRuntimeRpcArgs } from "./runtime";

describe("quest runtime command adapter", () => {
  it("sends an edge advance with the loaded optimistic version", () => {
    expect(toQuestRuntimeRpcArgs({
      campaignId: "campaign-1",
      questId: "quest-1",
      threadId: "thread-1",
      command: "advance",
      expectedVersion: 7,
      edgeId: "edge-1",
    })).toEqual({
      p_campaign_id: "campaign-1",
      p_quest_id: "quest-1",
      p_thread_id: "thread-1",
      p_command: "advance",
      p_expected_version: 7,
      p_target_beat_id: null,
      p_edge_id: "edge-1",
      p_reason: null,
      p_push_return: false,
      p_provenance: {},
      p_spawn_edge_ids: null,
      p_hold_consequence_ids: null,
      p_dispatch_loot_ids: null,
    });
  });

  it("preserves jump reason, return intent, target, and provenance", () => {
    expect(toQuestRuntimeRpcArgs({
      campaignId: "campaign-1",
      questId: "quest-1",
      threadId: "thread-1",
      command: "jump",
      expectedVersion: 8,
      targetBeatId: "beat-3",
      reason: "Players followed the courier",
      pushReturn: true,
      provenance: { surface: "jump-picker" },
    })).toMatchObject({
      p_quest_id: "quest-1",
      p_thread_id: "thread-1",
      p_target_beat_id: "beat-3",
      p_reason: "Players followed the courier",
      p_push_return: true,
      p_provenance: { surface: "jump-picker" },
    });
  });

  // A command names exactly one chain. There is no target quest to disagree with
  // it: reaching another quest is navigation, not a cursor write.
  it("carries no target quest, so a command can only ever move its own chain", () => {
    const args = toQuestRuntimeRpcArgs({
      campaignId: "campaign-1",
      questId: "quest-1",
      threadId: "thread-1",
      command: "start",
      expectedVersion: 0,
      targetBeatId: "beat-1",
    });
    expect(args).not.toHaveProperty("p_target_quest_id");
    expect(args.p_quest_id).toBe("quest-1");
  });

  // #853: a parallel route spawns siblings, an Advance can hold back payoffs,
  // and it can dispatch loot in the same transaction as the move — all three
  // are optional, batch-shaped inputs the RPC accepts alongside the command.
  it("carries spawned threads, held payoffs, and dispatched loot when given", () => {
    const args = toQuestRuntimeRpcArgs({
      campaignId: "campaign-1",
      questId: "quest-1",
      threadId: "thread-1",
      command: "advance",
      expectedVersion: 3,
      edgeId: "edge-1",
      spawnEdgeIds: ["edge-2", "edge-3"],
      holdConsequenceIds: ["cons-1"],
      dispatchLootIds: ["loot-1", "loot-2"],
    });
    expect(args.p_spawn_edge_ids).toEqual(["edge-2", "edge-3"]);
    expect(args.p_hold_consequence_ids).toEqual(["cons-1"]);
    expect(args.p_dispatch_loot_ids).toEqual(["loot-1", "loot-2"]);
  });

  it("defaults the three batch inputs to null rather than an empty array", () => {
    const args = toQuestRuntimeRpcArgs({
      campaignId: "campaign-1",
      questId: "quest-1",
      threadId: "thread-1",
      command: "previous",
      expectedVersion: 1,
    });
    expect(args.p_spawn_edge_ids).toBeNull();
    expect(args.p_hold_consequence_ids).toBeNull();
    expect(args.p_dispatch_loot_ids).toBeNull();
  });
});
