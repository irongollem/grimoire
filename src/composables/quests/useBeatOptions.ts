import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { BEATS_KEY } from "@/lib/campaignLiveSync/registry";

export interface BeatOption {
  id: string;
  /** "Quest · Beat", so two quests' beats called "The Ambush" can be told apart. */
  name: string;
  title: string;
}

/** Every beat of the campaign with its quest's title: one read, scoped by campaign, never one per beat. */
export async function fetchBeatOptions(campaignId: string): Promise<BeatOption[]> {
  const { data, error } = await supabase
    .from("quest_beats")
    // The constraint is named: a bare `quests(...)` embed is ambiguous since #871 (PGRST201, scripts/check-embeds.sh).
    .select("id, title, quests:quests!quest_beats_quest_campaign_fkey(title)")
    .eq("campaign_id", campaignId)
    .order("title", { ascending: true });
  if (error) throw error;
  const rows = data as unknown as { id: string; title: string; quests: { title: string } | null }[];
  return rows.map((r) => ({ id: r.id, title: r.title, name: r.quests ? `${r.quests.title} · ${r.title}` : r.title }));
}

/** The beats a clue may lie at. Read when the add form asks for them, and refreshed with the beats doorbell. */
export function useBeatOptions(enabled: () => boolean = () => true) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, "campaign-options", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useBeatOptions fetched without a campaign");
      return fetchBeatOptions(cid);
    },
    enabled: () => !!campaignId.value && enabled(),
  });
}
