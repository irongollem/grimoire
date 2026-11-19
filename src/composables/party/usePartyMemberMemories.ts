import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { PARTY_MEMBER_MEMORIES_KEY } from "@/lib/campaignLiveSync/registry";

/** One thing a party member lived through while someone else played them. */
export interface PartyMemberMemory {
  id: string;
  kind: string;
  body: string;
  created_at: string;
}

const LIMIT = 50;

/**
 * What a party member lived through while the AI played them (#1021 row 26), newest first. Their own player reads
 * it, and the campaign's DM. Both filters are in the query: the policy is a ceiling (a DM may read every party
 * member's), and this reads one character's in one campaign. Refreshed by the `party_member_memories` ring.
 */
export function usePartyMemberMemories(memberId: MaybeRefOrGetter<string | null>, campaignId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => [PARTY_MEMBER_MEMORIES_KEY, toValue(campaignId), toValue(memberId)] as const),
    queryFn: async ({ queryKey: [, campaign, member] }): Promise<PartyMemberMemory[]> => {
      if (!campaign || !member) throw new Error("usePartyMemberMemories read without a campaign and a character");
      const { data, error } = await supabase
        .from("party_member_memories")
        .select("id, kind, body, created_at")
        .eq("campaign_id", campaign)
        .eq("party_member_id", member)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return data as PartyMemberMemory[];
    },
    enabled: () => !!toValue(memberId) && !!toValue(campaignId),
  });
}
