import { buildNpcProfile } from "@edge-shared/npcProfile";
import type { DatePoint } from "@edge-shared/npcAge";
import type { Npc } from "@/types/npc.types";

/**
 * Client-side (BYOK/local) NPC context for the Voice Coach (#336). The local path has no edge function, so it
 * builds the context here, through the same builder the edge function uses (`_shared/npcProfile.ts`): one
 * implementation, one disguise rule (the true name of a disguised, unrevealed NPC is never sent).
 */
export function buildNpcVoiceProfile(npc: Npc, today: DatePoint | null = null): string {
  return buildNpcProfile(npc, today);
}
