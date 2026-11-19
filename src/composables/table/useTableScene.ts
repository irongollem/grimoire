import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useLocation } from "@/composables/locations/useLocations";
import type { Npc } from "@/types/npc.types";

export type SceneNpc = Pick<
  Npc,
  "id" | "name" | "portrait_url" | "portrait_focal_point" | "disguise_name" | "disguise_portrait_url" | "disguise_portrait_focal_point" | "is_revealed" | "unmasked_at"
>;

const NPC_COLUMNS =
  "id, name, portrait_url, portrait_focal_point, disguise_name, disguise_portrait_url, disguise_portrait_focal_point, is_revealed, unmasked_at";

const HERE_KEY = "table-here";

/**
 * Where the party is and who is with them. The name comes through `useLocation` (the app's own place reader); who is
 * here is every character of this campaign whose place it is. Characters who speak are placed with the party at the end
 * of a turn, so the page calls `refresh` when a scene or a turn arrives rather than polling.
 */
export function useTableScene(sceneId: MaybeRefOrGetter<string | null>, campaignId: MaybeRefOrGetter<string | null>) {
  const queryClient = useQueryClient();
  const place = useLocation(() => toValue(sceneId));
  const here = useQuery({
    queryKey: computed(() => [HERE_KEY, toValue(campaignId), toValue(sceneId)] as const),
    queryFn: async ({ queryKey: [, campaign, scene] }): Promise<SceneNpc[]> => {
      if (!campaign || !scene) throw new Error("useTableScene read without a campaign and a place");
      const { data, error } = await supabase
        .from("npcs")
        .select(NPC_COLUMNS)
        .eq("campaign_id", campaign)
        .eq("location_id", scene)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as SceneNpc[];
    },
    enabled: () => !!toValue(campaignId) && !!toValue(sceneId),
  });

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: [HERE_KEY] });
    const id = toValue(sceneId);
    if (id) void queryClient.invalidateQueries({ queryKey: ["locations", id] });
  }

  return { place, here, refresh };
}
