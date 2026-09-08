import { describe, expect, it } from "vitest";
import { isVersionConflictError, planAdvance } from "./advance";
import type {
  QuestRoutePayoff,
  QuestRouteLoot,
  QuestRuntimeChoice,
  QuestRuntimeContext,
  QuestRuntimeState,
  QuestThread,
  QuestThreadCursor,
} from "@/types/quest.types";

function thread(overrides: Partial<QuestThreadCursor> & { id: string }): QuestThreadCursor {
  return {
    campaign_id: "campaign-1",
    quest_id: "quest-1",
    label: overrides.id,
    status: "live",
    opened_by_edge_id: null,
    parent_thread_id: null,
    merged_into_thread_id: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    closed_at: null,
    updated_at: "2026-09-01T00:00:00Z",
    current_beat_id: null,
    current_beat_title: null,
    runtime_status: "running",
    version: 1,
    ...overrides,
  };
}

function payoff(overrides: Partial<QuestRoutePayoff> & { consequence_id: string }): QuestRoutePayoff {
  return {
    action: "complete",
    target_objective_id: null,
    target_objective: null,
    target_npc_id: null,
    target_npc: null,
    target_quest_id: null,
    target_quest: null,
    action_payload: {},
    after_days: 0,
    on_edge: true,
    ...overrides,
  };
}

function loot(overrides: Partial<QuestRouteLoot> & { id: string }): QuestRouteLoot {
  return { kind: "item", label: "80 gp", quantity: 1, item_id: null, ...overrides };
}

function choice(overrides: Partial<QuestRuntimeChoice> & { edge_id: string }): QuestRuntimeChoice {
  return {
    quest_id: "quest-1",
    beat_id: "beat-target",
    beat_title: "Testify before the Guild",
    beat_kind: "social",
    gate: null,
    effects: [],
    route_kind: "choice",
    thread_label: null,
    converge_mode: "any",
    site: null,
    payoff: [],
    loot: [],
    ...overrides,
  };
}

function state(overrides: Partial<QuestRuntimeState> = {}): QuestRuntimeState {
  return {
    campaign_id: "campaign-1",
    quest_id: "quest-1",
    thread_id: "thread-a",
    current_beat_id: "beat-current",
    return_stack: [],
    visit_stack: [],
    visit_index: 0,
    status: "running",
    version: 4,
    updated_by: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function mainThread(overrides: Partial<QuestThread> = {}): QuestThread {
  return {
    id: "thread-a",
    campaign_id: "campaign-1",
    quest_id: "quest-1",
    label: "Main",
    status: "live",
    opened_by_edge_id: null,
    parent_thread_id: null,
    merged_into_thread_id: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    closed_at: null,
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function baseContext(overrides: Partial<QuestRuntimeContext> = {}): QuestRuntimeContext {
  return {
    state: state(),
    current: null,
    previous: null,
    outgoing: [],
    return_target: null,
    path_so_far: [],
    thread: mainThread(),
    threads: [thread({ id: "thread-a" })],
    held: [],
    ...overrides,
  };
}

describe("planAdvance", () => {
  it("counts the payoff that will fire and the loot that stays held", () => {
    const context = baseContext({
      outgoing: [
        choice({
          edge_id: "edge-1",
          payoff: [
            payoff({ consequence_id: "c1" }),
            payoff({ consequence_id: "c2" }),
            payoff({ consequence_id: "c3" }),
          ],
          loot: [loot({ id: "l1" }), loot({ id: "l2" })],
        }),
      ],
    });

    const plan = planAdvance({
      context,
      edgeId: "edge-1",
      spawnEdgeIds: [],
      heldIds: ["c3"],
      dispatchIds: ["l1"],
    });

    expect(plan.fired).toBe(2);
    expect(plan.held).toBe(1);
  });

  it("treats an edge with no payoff or loot as firing and holding nothing", () => {
    const context = baseContext({ outgoing: [choice({ edge_id: "edge-1" })] });
    const plan = planAdvance({ context, edgeId: "edge-1", spawnEdgeIds: [], heldIds: [], dispatchIds: [] });
    expect(plan.fired).toBe(0);
    expect(plan.held).toBe(0);
  });

  it("lists the existing live and waiting threads, oldest first, then one letter per spawn", () => {
    const context = baseContext({
      threads: [
        thread({ id: "thread-a", created_at: "2026-09-01T00:00:00Z", status: "live" }),
        thread({ id: "thread-b", created_at: "2026-09-02T00:00:00Z", status: "waiting" }),
        thread({ id: "thread-closed", created_at: "2026-08-01T00:00:00Z", status: "closed" }),
      ],
      outgoing: [choice({ edge_id: "edge-1", route_kind: "parallel" })],
    });

    const plan = planAdvance({
      context,
      edgeId: "edge-1",
      spawnEdgeIds: ["edge-parallel-1"],
      heldIds: [],
      dispatchIds: [],
    });

    // thread-a and thread-b are already live/waiting (oldest first); the
    // closed thread drops out; the spawn is newer than both so it lands last.
    expect(plan.threadsAfter).toEqual(["A", "B", "C"]);
  });

  it("builds the exact rpc args useQuestRuntimeCommand needs", () => {
    const context = baseContext({
      state: state({ campaign_id: "campaign-9", quest_id: "quest-9", version: 12 }),
      thread: mainThread({ id: "thread-a", campaign_id: "campaign-9", quest_id: "quest-9" }),
      outgoing: [choice({ edge_id: "edge-1" })],
    });

    const plan = planAdvance({
      context,
      edgeId: "edge-1",
      spawnEdgeIds: ["edge-2"],
      heldIds: ["c1"],
      dispatchIds: ["l1"],
    });

    expect(plan.rpcArgs).toEqual({
      campaignId: "campaign-9",
      questId: "quest-9",
      threadId: "thread-a",
      command: "advance",
      edgeId: "edge-1",
      expectedVersion: 12,
      spawnEdgeIds: ["edge-2"],
      holdConsequenceIds: ["c1"],
      dispatchLootIds: ["l1"],
    });
  });

  it("falls back to the thread's own identity and version 0 when there is no runtime state yet", () => {
    const context = baseContext({
      state: null,
      thread: mainThread({ id: "thread-a", campaign_id: "campaign-5", quest_id: "quest-5" }),
      outgoing: [choice({ edge_id: "edge-1" })],
    });

    const plan = planAdvance({ context, edgeId: "edge-1", spawnEdgeIds: [], heldIds: [], dispatchIds: [] });

    expect(plan.rpcArgs.campaignId).toBe("campaign-5");
    expect(plan.rpcArgs.questId).toBe("quest-5");
    expect(plan.rpcArgs.expectedVersion).toBe(0);
  });
});

describe("isVersionConflictError", () => {
  it("recognises the serialization_failure SQLSTATE transition_quest_runtime raises on a stale version", () => {
    expect(isVersionConflictError({ code: "40001" })).toBe(true);
  });

  it("does not mistake another error code, or a non-error value, for a version conflict", () => {
    expect(isVersionConflictError({ code: "23505" })).toBe(false);
    expect(isVersionConflictError(new Error("boom"))).toBe(false);
    expect(isVersionConflictError(null)).toBe(false);
    expect(isVersionConflictError(undefined)).toBe(false);
    expect(isVersionConflictError("40001")).toBe(false);
  });
});
