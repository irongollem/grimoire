import type { QuestRuntimeCommand } from "@/types/quest.types";

export interface QuestRuntimeCommandInput {
  campaignId: string;
  command: QuestRuntimeCommand;
  expectedVersion: number;
  targetQuestId?: string;
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
    p_command: input.command,
    p_expected_version: input.expectedVersion,
    p_target_quest_id: input.targetQuestId ?? null,
    p_target_beat_id: input.targetBeatId ?? null,
    p_edge_id: input.edgeId ?? null,
    p_reason: input.reason ?? null,
    p_push_return: input.pushReturn ?? false,
    p_provenance: input.provenance ?? {},
  };
}
