import type { AiProvenance } from "@/ai/provenance";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { queueCanonEmbedding } from "@/lib/canon/queueCanonEmbedding";
import type { CanonLorePassage } from "@/types/canon.types";

/**
 * Writing a lore passage, outside any composable: the passage list's mutation and the note sorter (a note filed as lore
 * becomes the entry's first passage) both call it, and `lib/` may not import from `composables/`.
 */

/** What a new passage needs. At most one place may be set (the table refuses two, 23514). */
export type NewCanonPassage = {
  entry_id: string;
  title?: string;
  /** Tiptap JSON string. */
  body?: string | null;
  sort_order?: number;
  /** Set when the passage came from an accepted AI suggestion. */
  ai_provenance?: AiProvenance | null;
  /** Who it is told to once told (a backstory passage the DM tells to its character only). */
  player_visible_to?: string[];
} & (
  | { location_id?: string; npc_id?: never; quest_beat_id?: never }
  | { npc_id?: string; location_id?: never; quest_beat_id?: never }
  | { quest_beat_id?: string; location_id?: never; npc_id?: never }
);

export async function createCanonPassage(campaignId: string, input: NewCanonPassage): Promise<CanonLorePassage> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("canon_lore_passages")
    .insert({ ...input, campaign_id: campaignId, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  const created = data as CanonLorePassage;
  // A lore entry's one vector folds its passages in, so a new passage changes the entry's embed text (#1226).
  queueCanonEmbedding(created.entry_id);
  return created;
}
