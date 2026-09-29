import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";

/**
 * The user ids the caller may whisper in a campaign (#927). Whether another
 * member is a young player is readable only by that child and their parent, so
 * the browser cannot work it out from the member list; the server answers, and
 * the same rule refuses a hand-made insert (`campaign_messages_insert`).
 */
export async function fetchWhisperRecipients(campaignId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_whisper_recipients", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  return data as string[];
}

export function useWhisperRecipients() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const { data: members } = useCampaignMembers();

  // The member list is pushed live (`campaign_members` in `SYNC_TABLES`), so
  // keying on who is in it re-runs this query when someone joins or leaves,
  // with no extra invalidation route and no poll.
  const memberSignature = computed(() =>
    (members.value ?? []).map((m) => m.user_id).sort().join(","),
  );

  const query = useQuery({
    queryKey: computed(() => ["whisper-recipients", campaignId.value, memberSignature.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("useWhisperRecipients fetched without a campaign");
      return fetchWhisperRecipients(cid);
    },
    enabled: () => !!campaignId.value,
  });

  const allowedIds = computed(() => new Set(query.data.value ?? []));

  /** Only the members the caller may whisper. Empty until the server has answered: failing closed. */
  function whisperable<T extends { user_id: string }>(others: readonly T[]): T[] {
    return others.filter((m) => allowedIds.value.has(m.user_id));
  }

  return { allowedIds, whisperable, query };
}
