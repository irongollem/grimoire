import type { NpcStatus, NpcRelationship } from "@/types/npc.types";

export interface NpcAiResult {
  name: string;
  race: string;
  alignment: string;
  age: string;
  occupation: string;
  /** Plain text — convert to Tiptap JSON before writing to form */
  appearance: string;
  personality: string;
  backstory: string;
  notes: string;
  status: NpcStatus;
  relationship: NpcRelationship;
  tags: string[];
  /** NPC-specific subject description for image generation */
  image_prompt: string;
}

export interface NpcAiGenerated extends NpcAiResult {
  portrait_url: string | null;
}
