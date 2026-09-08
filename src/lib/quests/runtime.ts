import type { QuestRuntimeCommand } from "@/types/quest.types";

/**
 * A command against one thread's cursor (#853). There is no target quest: a
 * command moves the thread named by `threadId`, within the chain named by
 * `questId`, and nothing else. Reaching another quest is navigation to its own
 * Run surface, which writes no runtime state and needs no reason — only moving
 * a cursor within a chain does.
 *
 * `threadId` is required, not optional: every runtime row now has one (the
 * migration backfills a "Main" thread for every quest that predates this), so
 * there is no cursor left to address without it.
 */
export interface QuestRuntimeCommandInput {
  campaignId: string;
  questId: string;
  threadId: string;
  command: QuestRuntimeCommand;
  expectedVersion: number;
  targetBeatId?: string;
  edgeId?: string;
  reason?: string;
  pushReturn?: boolean;
  provenance?: Record<string, unknown>;
  /** Parallel routes to also take in the same transaction as this command —
   *  each spawns its own thread rather than moving this one. */
  spawnEdgeIds?: string[];
  /** Payoffs to log without performing — offered back later from the log
   *  (`QuestHeldPayoff`) rather than fired now. */
  holdConsequenceIds?: string[];
  /** Loot placements to drop to chat in the same transaction as this move. */
  dispatchLootIds?: string[];
}

/** Keep the client adapter deliberately mechanical: command meaning and
 * authorization live in the transaction, never in a second browser state machine. */
export function toQuestRuntimeRpcArgs(input: QuestRuntimeCommandInput) {
  return {
    p_campaign_id: input.campaignId,
    p_quest_id: input.questId,
    p_thread_id: input.threadId,
    p_command: input.command,
    p_expected_version: input.expectedVersion,
    p_target_beat_id: input.targetBeatId ?? null,
    p_edge_id: input.edgeId ?? null,
    p_reason: input.reason ?? null,
    p_push_return: input.pushReturn ?? false,
    p_provenance: input.provenance ?? {},
    p_spawn_edge_ids: input.spawnEdgeIds ?? null,
    p_hold_consequence_ids: input.holdConsequenceIds ?? null,
    p_dispatch_loot_ids: input.dispatchLootIds ?? null,
  };
}
