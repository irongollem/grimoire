import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";

export interface SpeciesName {
  id: string;
  name: string;
}

/**
 * The field guide's species by name alone, for the @-mention list and a mention chip (#1283). Kept apart from
 * `useCampaignSpecies` on purpose: a chip renders on nearly every page, so this module imports only what the app already
 * loads at startup, never the canon reads, the habitats or the world block (they added four chunks to the startup path,
 * caught by the request budgets on 27 Nov 2026). Under `CANON_KEY`, so a species change rings it fresh.
 */
export function useSpeciesNames(wanted: () => boolean = () => true) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const query = useQuery({
    queryKey: computed(() => [CANON_KEY, "species-names", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<SpeciesName[]> => {
      if (cid === null) throw new Error("useSpeciesNames fetched without a campaign");
      const { data, error } = await supabase.from("campaign_species").select("id, name").eq("campaign_id", cid).order("name");
      if (error) throw error;
      return data as SpeciesName[];
    },
    enabled: computed(() => !!campaignId.value && wanted()),
  });
  return { species: computed(() => query.data.value ?? []) };
}
