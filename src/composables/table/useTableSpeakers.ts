import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { SceneNpc } from "./useTableScene";

const COLUMNS =
  "id, name, portrait_url, portrait_focal_point, disguise_name, disguise_portrait_url, disguise_portrait_focal_point, is_revealed, unmasked_at";

/**
 * The records behind the characters who have spoken, by id, for their portraits. A speaker with no record (a crowd, a
 * passer-by the narrator made up) has no id and so no portrait, and the page draws no plate for them. Ids are
 * sorted into the key so the same set of speakers shares one read however they arrived.
 */
export function useTableSpeakers(speakerIds: MaybeRefOrGetter<string[]>, campaignId: MaybeRefOrGetter<string | null>) {
  const ids = computed(() => [...new Set(toValue(speakerIds))].sort());
  const query = useQuery({
    queryKey: computed(() => ["table-speakers", toValue(campaignId), ids.value] as const),
    queryFn: async ({ queryKey: [, campaign, wanted] }): Promise<SceneNpc[]> => {
      if (!campaign) throw new Error("useTableSpeakers read without a campaign");
      const { data, error } = await supabase.from("npcs").select(COLUMNS).eq("campaign_id", campaign).in("id", wanted);
      if (error) throw error;
      return data as SceneNpc[];
    },
    enabled: () => !!toValue(campaignId) && ids.value.length > 0,
    // The previous set stays on screen while a grown set loads, so a new speaker never blanks the others' plates.
    placeholderData: (previous) => previous,
  });
  const byId = computed(() => new Map((query.data.value ?? []).map((npc) => [npc.id, npc])));
  return { ...query, byId };
}
