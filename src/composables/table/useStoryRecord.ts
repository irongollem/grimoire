import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { STORY_RECORD_KEY } from "@/lib/campaignLiveSync/registry";
import type { StoryFact, StoryFactLink } from "@/lib/table/solo/storyRecord";
import { useCampaignStore } from "@/stores/campaign";

const FACT_COLUMNS = "id, campaign_id, session_id, body, known_to_player, supersedes_id, source, created_at";
const LINK_COLUMNS = "id, fact_id, campaign_id, kind, npc_id, location_id, quest_id, quest_beat_id, item_id, monster_id";
// PostgREST answers at most 1,000 rows a request; a long campaign's record is read in pages so nothing is cut off.
const PAGE = 1000;

async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: Error | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/**
 * The active campaign's record. The campaign is in the query as well as in RLS: the table's policy is a ceiling (a
 * player reads only what the party knows, a DM reads everything), not the filter, and a second campaign's facts must
 * never land on this page. The key starts with `STORY_RECORD_KEY`, so the campaign doorbell refreshes it when a fact
 * is filed; nothing here polls.
 */
export function useStoryRecord() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);

  const facts = useQuery({
    queryKey: computed(() => [STORY_RECORD_KEY, "facts", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }): Promise<StoryFact[]> => {
      if (!cid) throw new Error("useStoryRecord read without a campaign");
      return readAll<StoryFact>((from, to) =>
        supabase.from("story_facts").select(FACT_COLUMNS).eq("campaign_id", cid)
          .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
      );
    },
    enabled: () => !!campaignId.value,
  });

  const links = useQuery({
    queryKey: computed(() => [STORY_RECORD_KEY, "links", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }): Promise<StoryFactLink[]> => {
      if (!cid) throw new Error("useStoryRecord read without a campaign");
      return readAll<StoryFactLink>((from, to) =>
        supabase.from("story_fact_links").select(LINK_COLUMNS).eq("campaign_id", cid)
          .order("id", { ascending: true }).range(from, to),
      );
    },
    enabled: () => !!campaignId.value,
  });

  return { facts, links };
}
