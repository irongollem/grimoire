import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { contentMentionsEntity } from "@/lib/tiptap/mentions";

export interface EntityBacklink {
  id: string;
  title: string;
}

/**
 * Session notes that @mention a given entity — the "Mentioned in" section on
 * a DM detail surface (epic #932, story 1).
 *
 * `content.like` narrows to notes whose stored Tiptap JSON merely *contains*
 * the id as a substring, which is cheap but not sufficient (the id could sit
 * inside another mention's id, or plain text); every hit is then confirmed
 * by parsing its content and walking for a real `entityMention` node via
 * `contentMentionsEntity`. A parse failure drops that row rather than
 * throwing.
 *
 * The query key starts with `"notes"` — the same first segment
 * `useNotes.ts`'s `QUERY_KEY` uses — so `invalidateQueries({ queryKey:
 * ["notes"] })` (fired by every note create/update/delete) also invalidates
 * this, and saving a note refreshes any backlinks section without a
 * dedicated wire-up.
 */
export function useEntityBacklinks(entityId: MaybeRefOrGetter<string | null | undefined>) {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(
      () => ["notes", "backlinks", activeCampaignId.value, toValue(entityId)] as const,
    ),
    queryFn: async ({ queryKey: [, , campaignId, id] }): Promise<EntityBacklink[]> => {
      if (!campaignId || !id) return [];

      const { data, error } = await supabase
        .from("notes")
        .select("id, title, content")
        .eq("campaign_id", campaignId)
        .like("content", `%${id}%`);
      if (error) throw error;

      return (data ?? [])
        .filter((note) => contentMentionsEntity(note.content, id))
        .map((note) => ({ id: note.id, title: note.title }))
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    enabled: () => !!activeCampaignId.value && !!toValue(entityId),
  });
}
