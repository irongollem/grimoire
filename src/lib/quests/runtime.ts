import type { QuestRuntimeCommand } from "@/types/quest.types";

/**
 * A command against one quest's cursor. There is no target quest: a command
 * moves the chain named by `questId` and nothing else. Reaching another quest is
 * navigation to its own Run surface, which writes no runtime state and needs no
 * reason — only moving a cursor within a chain does.
 */
export interface QuestRuntimeCommandInput {
  campaignId: string;
  questId: string;
  command: QuestRuntimeCommand;
  expectedVersion: number;
  targetBeatId?: string;
  edgeId?: string;
  reason?: string;
  pushReturn?: boolean;
  provenance?: Record<string, unknown>;
}

/** Keep the client adapter deliberately mechanical: command meaning and
 * authorization live in the transaction, never in a second browser state machine. */
export function toQuestRuntimeRpcArgs(input: QuestRuntimeCommandInput) {
  return {
    p_campaign_id: input.campaignId,
    p_quest_id: input.questId,
    p_command: input.command,
    p_expected_version: input.expectedVersion,
    p_target_beat_id: input.targetBeatId ?? null,
    p_edge_id: input.edgeId ?? null,
    p_reason: input.reason ?? null,
    p_push_return: input.pushReturn ?? false,
    p_provenance: input.provenance ?? {},
  };
}
