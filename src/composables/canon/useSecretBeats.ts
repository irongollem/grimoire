import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { BEATS_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import { normaliseIds } from "@/composables/useRowsByIds";

export interface SecretBeat {
  id: string;
  quest_id: string;
  title: string;
}

/**
 * The beats tied to one canon secret (#1255 item 21), scoped to the campaign and the secret in the query (RLS lets
 * only the DM read `quest_beats`). Under the beats root, so the quest_beats ring refreshes it.
 */
export function useSecretBeats(secretId: MaybeRefOrGetter<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, "canon-secret", campaignId.value, toValue(secretId)] as const),
    queryFn: async ({ queryKey: [, , cid, sid] }): Promise<SecretBeat[]> => {
      if (cid === null) throw new Error("useSecretBeats fetched without a campaign");
      const { data, error } = await supabase
        .from("quest_beats")
        .select("id, quest_id, title")
        .eq("campaign_id", cid)
        .eq("canon_secret_id", sid)
        .order("created_at");
      if (error) throw error;
      return data as SecretBeat[];
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/**
 * The quest of each beat in a set (the beats a secret's clues lie at), scoped to the campaign and the ids in the query.
 * Only the DM reads `quest_beats`. Under the beats root, so the `quest_beats` ring refreshes it; nothing is asked for no ids.
 */
export function useBeatsByIds(beatIds: MaybeRefOrGetter<readonly string[]>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const ids = computed(() => normaliseIds(toValue(beatIds)));
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, "by-ids", campaignId.value, ...ids.value] as const),
    queryFn: async (): Promise<SecretBeat[]> => {
      const cid = campaignId.value;
      if (cid === null) throw new Error("useBeatsByIds fetched without a campaign");
      const { data, error } = await supabase.from("quest_beats").select("id, quest_id, title").eq("campaign_id", cid).in("id", ids.value);
      if (error) throw error;
      return data as SecretBeat[];
    },
    enabled: computed(() => !!campaignId.value && ids.value.length > 0),
  });
}
