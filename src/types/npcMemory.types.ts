import type { NpcMemoryKind } from "@edge-shared/npcMemories";
import type { AiProvenance } from "@/ai/provenance";

export { NPC_MEMORY_KINDS } from "@edge-shared/npcMemories";
export type { NpcMemoryKind } from "@edge-shared/npcMemories";

/** A row of `npc_memories` (#1019): one thing an NPC and the party have told each other. */
export interface NpcMemory {
  id: string;
  campaign_id: string;
  npc_id: string;
  user_id: string | null;
  session_id: string | null;
  kind: NpcMemoryKind;
  body: string;
  /** Party members the memory is about. */
  party_member_ids: string[];
  /** Party members who may read it in the player portal. */
  player_visible_to: string[];
  ai_provenance: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

/** campaign_id and user_id are never sent: a trigger and a column default supply them. */
export type NpcMemoryInsert = {
  npc_id: string;
  kind: NpcMemoryKind;
  body: string;
  session_id: string | null;
  party_member_ids: string[];
  player_visible_to: string[];
  ai_provenance?: AiProvenance | null;
};

export type NpcMemoryUpdate = Partial<
  Pick<NpcMemory, "kind" | "body" | "session_id" | "party_member_ids" | "player_visible_to">
>;

/** What a player may read of a memory shared with their character. */
export interface PlayerNpcMemory {
  id: string;
  npc_id: string;
  kind: NpcMemoryKind;
  body: string;
  session_id: string | null;
  created_at: string;
}
